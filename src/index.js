/**
 * BMAD Federated Knowledge System
 * Main entry point for the Git-Based Federated Knowledge System extension
 * 
 * @version 1.0.0
 */

const { FederatedDependencyResolver } = require('./resolvers/federated-dependency-resolver');
const { GitManager } = require('./managers/git-manager');
const { ConfigValidator } = require('./schemas/config-validator');
const { KnowledgeMerger } = require('./core/knowledge-merger');
const { Logger } = require('./core/logger');
const fs = require('fs');
const path = require('path');
class BmadFederatedKnowledge {
  constructor(options = {}) {
    this.options = {
      logLevel: 'info',
      cacheDir: './.bmad-fks-cache',
      configPath: './.bmad-fks-core/fks-core-config.yaml',
      ...options
    };

    this.logger = new Logger(this.options.logLevel);
    this.gitManager = new GitManager(this.options);
    this.configValidator = new ConfigValidator();
    this.knowledgeMerger = new KnowledgeMerger(this.options);
    this.dependencyResolver = new FederatedDependencyResolver({
      gitManager: this.gitManager,
      knowledgeMerger: this.knowledgeMerger,
      logger: this.logger,
      ...this.options
    });
       // Ensure .gitignore contains required directories
    this.ensureGitignore([
      this.options.cacheDir])
      //path.dirname(this.options.configPath) // .bmad-fks-core
    //]);
  }

   ensureGitignore(dirs) {
    try {
      const gitignorePath = path.resolve(process.cwd(), '.gitignore');
      let content = '';

      if (fs.existsSync(gitignorePath)) {
        content = fs.readFileSync(gitignorePath, 'utf8');
      }

      const lines = content.split(/\r?\n/);
      let updated = false;

      dirs.forEach((dir) => {
        const normalized = dir.endsWith('/') ? dir : dir + '/';
        if (!lines.includes(normalized)) {
          lines.push(normalized);
          updated = true;
        }
      });

      if (updated) {
        fs.writeFileSync(gitignorePath, lines.join('\n'), 'utf8');
        this.logger.info(`Updated .gitignore with BMAD directories: ${dirs.join(', ')}`);
      }
    } catch (err) {
      this.logger.warn('Could not update .gitignore automatically:', err.message);
    }
  }
  /**
   * Initialize the federated knowledge system
   * @param {Object} config - Configuration object
   * @returns {Promise<void>}
   */
  async initialize(config = null) {
    try {
      this.logger.info('Initializing BMAD Federated Knowledge System...');
      
      // Validate configuration
      if (config) {
        await this.configValidator.validate(config);
      }

      // Initialize components
      await this.gitManager.initialize();
      await this.dependencyResolver.initialize();
      
      this.logger.info('BMAD Federated Knowledge System initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize federated knowledge system:', error);
      throw error;
    }
  }

  /**
   * Sync all federated repositories
   * @returns {Promise<Object>} Sync results
   */
  async syncAll() {
    return await this.dependencyResolver.syncAllRepositories();
  }

  /**
   * Resolve knowledge dependencies for an agent
   * @param {Object} agentConfig - Agent configuration
   * @returns {Promise<Object>} Resolved knowledge sources
   */
  async resolveKnowledge(agentConfig) {
    return await this.dependencyResolver.resolveKnowledge(agentConfig);
  }

  /**
   * Add a new federated repository
   * @param {string} name - Repository name
   * @param {Object} config - Repository configuration
   * @returns {Promise<void>}
   */
  async addRepository(name, config) {
    await this.configValidator.validateRepositoryConfig(config);
    return await this.dependencyResolver.addRepository(name, config);
  }

  async addKnowledgeSource(name, config) {
    try {
      // Validate config by type
      const validatedConfig = await this.configValidator.validateKnowledgeConfig(config);
      return await this.dependencyResolver.addKnowledgeSource(name, config);
      // Track in memory

    } catch (error) {
      this.logger.error(`Failed to add knowledge source ${name}:`, error);
      throw error;
    }
  }


  /**
   * Remove a federated repository
   * @param {string} name - Repository name
   * @returns {Promise<void>}
   */
  async removeRepository(name) {
    return await this.dependencyResolver.removeRepository(name);
  }

  /**
   * Get status of all federated repositories
   * @returns {Promise<Object>} Repository status information
   */
  async getStatus() {
    return await this.dependencyResolver.getRepositoryStatus();
  }

  /**
   * Clean cache for specific repository or all repositories
   * @param {string} [repoName] - Optional repository name
   * @returns {Promise<void>}
   */
  async cleanCache(repoName = null) {
    return await this.gitManager.cleanCache(repoName);
  }
}


module.exports = {
  BmadFederatedKnowledge,
  FederatedDependencyResolver,
  GitManager,
  ConfigValidator,
  KnowledgeMerger
};

// Export default instance for convenience
module.exports.default = BmadFederatedKnowledge;