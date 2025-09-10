const { GitManager } = require('../src/managers/git-manager');
const { Logger } = require('../src/core/logger');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Mock simple-git
jest.mock('simple-git', () => {
  return jest.fn(() => ({
    clone: jest.fn(),
    pull: jest.fn(),
    checkout: jest.fn(),
    revparse: jest.fn(),
    log: jest.fn(),
    reset: jest.fn(),
    status: jest.fn(),
    checkIsRepo: jest.fn(),
    getRemotes: jest.fn()
  }));
});

describe('GitManager', () => {
  let gitManager;
  let tempDir;
  let mockGit;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-git-test-'));
    
    gitManager = new GitManager({
      cacheDir: tempDir,
      logLevel: 'error' // Suppress logs during tests
    });

    // Get the mocked git instance
    const simpleGit = require('simple-git');
    mockGit = simpleGit();
    
    await gitManager.initialize();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    test('should create cache directory', async () => {
      const newTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-git-init-'));
      const newGitManager = new GitManager({
        cacheDir: newTempDir,
        logLevel: 'error'
      });

      await newGitManager.initialize();
      
      const exists = await fs.pathExists(newTempDir);
      expect(exists).toBe(true);
      
      await fs.remove(newTempDir);
    });
  });

  describe('syncRepo', () => {
    test('should clone repository if it does not exist', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const localPath = path.join(tempDir, 'test-repo');
      const branch = 'main';

      // Mock successful clone
      mockGit.clone.mockResolvedValue();
      mockGit.log.mockResolvedValue({
        latest: {
          hash: 'abc123',
          message: 'Initial commit',
          author_name: 'Test User'
        }
      });

      const result = await gitManager.syncRepo(repoUrl, localPath, branch);

      expect(mockGit.clone).toHaveBeenCalledWith(
        repoUrl,
        localPath,
        expect.objectContaining({
          '--branch': branch,
          '--single-branch': true,
          '--depth': 1
        })
      );
      expect(result.status).toBe('success');
      expect(result.operation).toBe('clone');
    });

    test('should pull repository if it exists', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const localPath = path.join(tempDir, 'existing-repo');
      const branch = 'main';

      // Create existing repository directory
      await fs.ensureDir(localPath);
      await fs.writeFile(path.join(localPath, '.git', 'config'), '');

      // Mock successful pull
      mockGit.revparse.mockResolvedValue('main');
      mockGit.pull.mockResolvedValue({
        summary: {
          changes: 5,
          insertions: 10,
          deletions: 2
        }
      });
      mockGit.log.mockResolvedValue({
        latest: {
          hash: 'def456',
          message: 'Updated files',
          author_name: 'Test User'
        }
      });

      const result = await gitManager.syncRepo(repoUrl, localPath, branch);

      expect(mockGit.pull).toHaveBeenCalledWith('origin', branch);
      expect(result.status).toBe('success');
      expect(result.operation).toBe('pull');
    });

    test('should handle authentication configuration', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const localPath = path.join(tempDir, 'auth-repo');
      const branch = 'main';
      const authConfig = {
        type: 'token',
        token: 'ghp_test_token'
      };

      mockGit.clone.mockResolvedValue();
      mockGit.log.mockResolvedValue({
        latest: {
          hash: 'abc123',
          message: 'Initial commit',
          author_name: 'Test User'
        }
      });

      await gitManager.syncRepo(repoUrl, localPath, branch, authConfig);

      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://ghp_test_token@github.com/user/repo.git',
        localPath,
        expect.any(Object)
      );
    });

    test('should handle sync errors gracefully', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const localPath = path.join(tempDir, 'error-repo');
      const branch = 'main';

      mockGit.clone.mockRejectedValue(new Error('Network error'));

      const result = await gitManager.syncRepo(repoUrl, localPath, branch);

      expect(result.status).toBe('error');
      expect(result.error).toBe('Network error');
    });

    test('should prevent concurrent syncs of same repository', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const localPath = path.join(tempDir, 'concurrent-repo');
      const branch = 'main';

      // Mock slow clone
      mockGit.clone.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      mockGit.log.mockResolvedValue({ latest: { hash: 'abc123' } });

      // Start two syncs simultaneously
      const sync1Promise = gitManager.syncRepo(repoUrl, localPath, branch);
      const sync2Promise = gitManager.syncRepo(repoUrl, localPath, branch);

      const [result1, result2] = await Promise.all([sync1Promise, sync2Promise]);

      // One should succeed, one should be marked as in progress
      const statuses = [result1.status, result2.status].sort();
      expect(statuses).toEqual(['in_progress', 'success']);
    });
  });

  describe('shouldSync', () => {
    test('should return true for daily policy after 24 hours', () => {
      const config = { sync_policy: 'daily' };
      const repoName = 'test-repo';

      // Set last sync to 25 hours ago
      const lockKey = `${config.repo}:${config.local_cache}`;
      gitManager.syncTimestamps.set(lockKey, Date.now() - (25 * 60 * 60 * 1000));

      const shouldSync = gitManager.shouldSync(repoName, config);
      expect(shouldSync).toBe(true);
    });

    test('should return false for daily policy within 24 hours', () => {
      const config = { sync_policy: 'daily' };
      const repoName = 'test-repo';

      // Set last sync to 1 hour ago
      const lockKey = `${config.repo}:${config.local_cache}`;
      gitManager.syncTimestamps.set(lockKey, Date.now() - (1 * 60 * 60 * 1000));

      const shouldSync = gitManager.shouldSync(repoName, config);
      expect(shouldSync).toBe(false);
    });

    test('should return true for weekly policy after 7 days', () => {
      const config = { sync_policy: 'weekly' };
      const repoName = 'test-repo';

      // Set last sync to 8 days ago
      const lockKey = `${config.repo}:${config.local_cache}`;
      gitManager.syncTimestamps.set(lockKey, Date.now() - (8 * 24 * 60 * 60 * 1000));

      const shouldSync = gitManager.shouldSync(repoName, config);
      expect(shouldSync).toBe(true);
    });

    test('should return false for on_demand policy', () => {
      const config = { sync_policy: 'on_demand' };
      const repoName = 'test-repo';

      const shouldSync = gitManager.shouldSync(repoName, config);
      expect(shouldSync).toBe(false);
    });

    test('should return false for manual policy', () => {
      const config = { sync_policy: 'manual' };
      const repoName = 'test-repo';

      const shouldSync = gitManager.shouldSync(repoName, config);
      expect(shouldSync).toBe(false);
    });

    test('should return true if never synced', () => {
      const config = { sync_policy: 'daily' };
      const repoName = 'never-synced-repo';

      const shouldSync = gitManager.shouldSync(repoName, config);
      expect(shouldSync).toBe(true);
    });
  });

  describe('getRepoStatus', () => {
    test('should return not_cloned for non-existent repository', async () => {
      const localPath = path.join(tempDir, 'non-existent');

      const status = await gitManager.getRepoStatus(localPath);

      expect(status.status).toBe('not_cloned');
      expect(status.exists).toBe(false);
    });

    test('should return invalid_repo for non-git directory', async () => {
      const localPath = path.join(tempDir, 'not-git');
      await fs.ensureDir(localPath);

      mockGit.checkIsRepo.mockResolvedValue(false);

      const status = await gitManager.getRepoStatus(localPath);

      expect(status.status).toBe('invalid_repo');
      expect(status.exists).toBe(true);
      expect(status.isRepo).toBe(false);
    });

    test('should return ready status for valid repository', async () => {
      const localPath = path.join(tempDir, 'valid-repo');
      await fs.ensureDir(localPath);

      mockGit.checkIsRepo.mockResolvedValue(true);
      mockGit.status.mockResolvedValue({
        current: 'main',
        ahead: 0,
        behind: 0,
        modified: [],
        staged: []
      });
      mockGit.log.mockResolvedValue({
        latest: {
          hash: 'abc123',
          message: 'Test commit',
          author_name: 'Test User',
          date: '2023-01-01'
        }
      });
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/user/repo.git' } }
      ]);

      const status = await gitManager.getRepoStatus(localPath);

      expect(status.status).toBe('ready');
      expect(status.branch).toBe('main');
      expect(status.lastCommit.hash).toBe('abc123');
    });
  });

  describe('cleanCache', () => {
    test('should clean all cache when no repo name provided', async () => {
      // Create some test files
      await fs.writeFile(path.join(tempDir, 'test-file.txt'), 'test');
      
      await gitManager.cleanCache();

      const exists = await fs.pathExists(path.join(tempDir, 'test-file.txt'));
      expect(exists).toBe(false);
    });

    test('should clean specific repository cache', async () => {
      const repoPath = path.join(tempDir, 'specific-repo');
      await fs.ensureDir(repoPath);
      await fs.writeFile(path.join(repoPath, 'test-file.txt'), 'test');

      // Add to sync timestamps
      const lockKey = 'https://github.com/user/repo.git:' + repoPath;
      gitManager.syncTimestamps.set(lockKey, Date.now());

      await gitManager.cleanCache('specific-repo');

      const exists = await fs.pathExists(repoPath);
      expect(exists).toBe(false);
      expect(gitManager.syncTimestamps.has(lockKey)).toBe(false);
    });
  });

  describe('configureAuthentication', () => {
    test('should return original URL for SSH authentication', () => {
      const repoUrl = 'git@github.com:user/repo.git';
      const authConfig = { type: 'ssh' };

      const result = gitManager.configureAuthentication(repoUrl, authConfig);
      expect(result).toBe(repoUrl);
    });

    test('should configure GitHub token authentication', () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const authConfig = { type: 'token', token: 'ghp_test_token' };

      const result = gitManager.configureAuthentication(repoUrl, authConfig);
      expect(result).toBe('https://ghp_test_token@github.com/user/repo.git');
    });

    test('should configure GitLab token authentication', () => {
      const repoUrl = 'https://gitlab.com/user/repo.git';
      const authConfig = { type: 'token', token: 'glpat_test_token' };

      const result = gitManager.configureAuthentication(repoUrl, authConfig);
      expect(result).toBe('https://oauth2:glpat_test_token@gitlab.com/user/repo.git');
    });

    test('should configure basic authentication', () => {
      const repoUrl = 'https://example.com/user/repo.git';
      const authConfig = { type: 'basic', username: 'user', password: 'pass' };

      const result = gitManager.configureAuthentication(repoUrl, authConfig);
      expect(result).toBe('https://user:pass@example.com/user/repo.git');
    });
  });
});