const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');
const { Logger } = require('../core/logger');

/**
 * Git Manager for handling repository operations in the federated knowledge system
 * Manages cloning, syncing, and caching of federated repositories
 */
class GitManager {
  constructor(options = {}) {
    this.options = {
      cacheDir: './bmad-cache',
      timeout: 300000, // 5 minutes
      retryAttempts: 3,
      parallelSync: true,
      ...options
    };

    this.logger = new Logger(options.logLevel || 'info');
    this.syncTimestamps = new Map();
    this.lockFiles = new Map();
  }

  /**
   * Initialize the Git Manager
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      await fs.ensureDir(this.options.cacheDir);
      this.logger.info(`Git Manager initialized with cache directory: ${this.options.cacheDir}`);
    } catch (error) {
      this.logger.error('Failed to initialize Git Manager:', error);
      throw error;
    }
  }

  /**
   * Sync a repository to local cache
   * @param {string} repoUrl - Repository URL
   * @param {string} localPath - Local cache path
   * @param {string} branch - Branch to sync
   * @param {Object} authConfig - Authentication configuration
   * @returns {Promise<Object>} Sync result
   */
  async syncRepo(repoUrl, localPath, branch = 'main', authConfig = null) {
    const lockKey = `${repoUrl}:${localPath}`;
    
    try {
      // Check if sync is already in progress
      if (this.lockFiles.has(lockKey)) {
        this.logger.warn(`Sync already in progress for ${repoUrl}`);
        return { status: 'in_progress', message: 'Sync already in progress' };
      }

      // Set lock
      this.lockFiles.set(lockKey, Date.now());

      const absolutePath = path.resolve(localPath);
      const exists = await fs.pathExists(absolutePath);

      let git;
      let result;

      if (exists) {
        // Repository exists, pull latest changes
        git = simpleGit(absolutePath);
        result = await this.pullRepository(git, branch, repoUrl);
      } else {
        // Repository doesn't exist, clone it
        await fs.ensureDir(path.dirname(absolutePath));
        git = simpleGit();
        result = await this.cloneRepository(git, repoUrl, absolutePath, branch, authConfig);
      }

      // Update sync timestamp
      this.syncTimestamps.set(lockKey, Date.now());

      this.logger.info(`Successfully synced repository ${repoUrl} to ${localPath}`);
      return {
        status: 'success',
        path: absolutePath,
        branch,
        timestamp: new Date().toISOString(),
        ...result
      };

    } catch (error) {
      this.logger.error(`Failed to sync repository ${repoUrl}:`, error);
      return {
        status: 'error',
        error: error.message,
        path: localPath,
        timestamp: new Date().toISOString()
      };
    } finally {
      // Release lock
      this.lockFiles.delete(lockKey);
    }
  }

  /**
   * Clone a repository
   * @param {Object} git - Simple-git instance
   * @param {string} repoUrl - Repository URL
   * @param {string} localPath - Local path
   * @param {string} branch - Branch to clone
   * @param {Object} authConfig - Authentication configuration
   * @returns {Promise<Object>} Clone result
   */
  async cloneRepository(git, repoUrl, localPath, branch, authConfig) {
    const cloneOptions = {
      '--branch': branch,
      '--single-branch': true,
      '--depth': 1 // Shallow clone for faster sync
    };

    // Configure authentication if provided
    if (authConfig) {
      const authenticatedUrl = this.configureAuthentication(repoUrl, authConfig);
      await git.clone(authenticatedUrl, localPath, cloneOptions);
    } else {
      await git.clone(repoUrl, localPath, cloneOptions);
    }

    const gitInstance = simpleGit(localPath);
    const log = await gitInstance.log(['-1']);
    
    return {
      operation: 'clone',
      commit: log.latest?.hash,
      message: log.latest?.message,
      author: log.latest?.author_name
    };
  }

  /**
   * Pull latest changes from repository
   * @param {Object} git - Simple-git instance
   * @param {string} branch - Branch to pull
   * @param {string} repoUrl - Repository URL for logging
   * @returns {Promise<Object>} Pull result
   */
  async pullRepository(git, branch, repoUrl) {
    try {
      // Ensure we're on the correct branch
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      if (currentBranch.trim() !== branch) {
        await git.checkout(branch);
      }

      // Pull latest changes
      const pullResult = await git.pull('origin', branch);
      
      // Get latest commit info
      const log = await git.log(['-1']);
      
      return {
        operation: 'pull',
        summary: pullResult.summary,
        commit: log.latest?.hash,
        message: log.latest?.message,
        author: log.latest?.author_name,
        changes: pullResult.summary.changes,
        insertions: pullResult.summary.insertions,
        deletions: pullResult.summary.deletions
      };
    } catch (error) {
      // If pull fails, try to reset and pull again
      this.logger.warn(`Pull failed for ${repoUrl}, attempting reset and pull`);
      await git.reset(['--hard', `origin/${branch}`]);
      const pullResult = await git.pull('origin', branch);
      
      return {
        operation: 'reset_and_pull',
        summary: pullResult.summary,
        warning: 'Had to reset local changes'
      };
    }
  }

  /**
   * Configure authentication for repository URL
   * @param {string} repoUrl - Repository URL
   * @param {Object} authConfig - Authentication configuration
   * @returns {string} Authenticated URL
   */
  configureAuthentication(repoUrl, authConfig) {
    if (!authConfig || authConfig.type === 'ssh') {
      return repoUrl; // SSH uses key-based auth
    }

    if (authConfig.type === 'token') {
      // For GitHub/GitLab token authentication
      if (repoUrl.includes('github.com')) {
        return repoUrl.replace('https://github.com/', `https://${authConfig.token}@github.com/`);
      } else if (repoUrl.includes('gitlab.com')) {
        return repoUrl.replace('https://gitlab.com/', `https://oauth2:${authConfig.token}@gitlab.com/`);
      }
    }

    if (authConfig.type === 'basic') {
      const credentials = `${authConfig.username}:${authConfig.password}`;
      return repoUrl.replace('https://', `https://${credentials}@`);
    }

    return repoUrl;
  }

  /**
   * Check if repository needs sync based on policy
   * @param {string} repoName - Repository name
   * @param {Object} config - Repository configuration
   * @returns {boolean} Whether sync is needed
   */
  shouldSync(repoName, config) {
    const lockKey = `${config.repo}:${config.local_cache}`;
    const lastSync = this.syncTimestamps.get(lockKey);

    if (!lastSync) {
      return true; // Never synced
    }

    const now = Date.now();
    const timeDiff = now - lastSync;

    switch (config.sync_policy) {
      case 'daily':
        return timeDiff > 24 * 60 * 60 * 1000; // 24 hours
      case 'weekly':
        return timeDiff > 7 * 24 * 60 * 60 * 1000; // 7 days
      case 'on_demand':
        return false; // Only sync when explicitly requested
      case 'manual':
        return false; // Never auto-sync
      default:
        return false;
    }
  }

  /**
   * Get repository status
   * @param {string} localPath - Local repository path
   * @returns {Promise<Object>} Repository status
   */
  async getRepoStatus(localPath) {
    try {
      const absolutePath = path.resolve(localPath);
      const exists = await fs.pathExists(absolutePath);

      if (!exists) {
        return { status: 'not_cloned', exists: false };
      }

      const git = simpleGit(absolutePath);
      const isRepo = await git.checkIsRepo();

      if (!isRepo) {
        return { status: 'invalid_repo', exists: true, isRepo: false };
      }

      const status = await git.status();
      const log = await git.log(['-1']);
      const remotes = await git.getRemotes(true);

      return {
        status: 'ready',
        exists: true,
        isRepo: true,
        branch: status.current,
        ahead: status.ahead,
        behind: status.behind,
        modified: status.modified,
        staged: status.staged,
        lastCommit: {
          hash: log.latest?.hash,
          message: log.latest?.message,
          author: log.latest?.author_name,
          date: log.latest?.date
        },
        remotes: remotes.map(r => ({ name: r.name, url: r.refs.fetch }))
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Clean cache for specific repository or all repositories
   * @param {string} [repoName] - Optional repository name
   * @returns {Promise<void>}
   */
  async cleanCache(repoName = null) {
    try {
      if (repoName) {
        // Clean specific repository cache
        const lockKey = Array.from(this.syncTimestamps.keys()).find(key => key.includes(repoName));
        if (lockKey) {
          const [, localPath] = lockKey.split(':');
          await fs.remove(path.resolve(localPath));
          this.syncTimestamps.delete(lockKey);
          this.logger.info(`Cleaned cache for repository: ${repoName}`);
        }
      } else {
        // Clean all cache
        await fs.remove(this.options.cacheDir);
        await fs.ensureDir(this.options.cacheDir);
        this.syncTimestamps.clear();
        this.logger.info('Cleaned all repository cache');
      }
    } catch (error) {
      this.logger.error('Failed to clean cache:', error);
      throw error;
    }
  }

  /**
   * Get sync timestamps for all repositories
   * @returns {Map} Sync timestamps map
   */
  getSyncTimestamps() {
    return new Map(this.syncTimestamps);
  }

  /**
   * Force sync repository regardless of policy
   * @param {string} repoUrl - Repository URL
   * @param {string} localPath - Local cache path
   * @param {string} branch - Branch to sync
   * @param {Object} authConfig - Authentication configuration
   * @returns {Promise<Object>} Sync result
   */
  async forceSync(repoUrl, localPath, branch = 'main', authConfig = null) {
    const lockKey = `${repoUrl}:${localPath}`;
    this.syncTimestamps.delete(lockKey); // Remove timestamp to force sync
    return await this.syncRepo(repoUrl, localPath, branch, authConfig);
  }
}

module.exports = { GitManager };