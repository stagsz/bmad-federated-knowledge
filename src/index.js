/**
 * BMAD Federated Knowledge System
 * Main entry point for the Git-Based Federated Knowledge System extension
 * 
 * @author BMAD Community
 * @version 1.0.0
 */

const { FederatedDependencyResolver } = require('./resolvers/federated-dependency-resolver');
const { GitManager } = require('./managers/git-manager');
const { ConfigValidator } = require('./schemas/config-validator');
const { KnowledgeMerger } = require('./core/knowledge-merger');
const { Logger } = require('./core/logger');

class BmadFederatedKnowledge {
  constructor(options = {}) {
    this.options = {
      logLevel: 'info',
      cacheDir: './bmad-cache',
      configPath: './bmad-core/core-config.yaml',
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