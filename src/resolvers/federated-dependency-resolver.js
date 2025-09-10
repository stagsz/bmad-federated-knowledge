const fs = require('fs-extra');
const path = require('path');
const { ConfigValidator } = require('../schemas/config-validator');

/**
 * Federated Dependency Resolver
 * Extends BMAD's dependency resolution to support federated knowledge repositories
 */
class FederatedDependencyResolver {
  constructor(options = {}) {
    this.options = {
      configPath: './bmad-core/core-config.yaml',
      cacheDir: './bmad-cache',
      parallelSync: true,
      ...options
    };

    this.gitManager = options.gitManager;
    this.knowledgeMerger = options.knowledgeMerger;
    this.logger = options.logger;
    this.configValidator = new ConfigValidator();
    
    this.federatedRepos = new Map();
    this.config = null;
    this.initialized = false;
  }

  /**
   * Initialize the federated dependency resolver
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.logger.info('Initializing Federated Dependency Resolver...');
      
      // Load configuration
      await this.loadConfiguration();
      
      // Initialize federated repositories
      await this.initializeFederatedRepos();
      
      this.initialized = true;
      this.logger.info('Federated Dependency Resolver initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Federated Dependency Resolver:', error);
      throw error;
    }
  }

  /**
   * Load and validate configuration
   * @returns {Promise<void>}
   */
  async loadConfiguration() {
    try {
      const configExists = await fs.pathExists(this.options.configPath);
      
      if (!configExists) {
        this.logger.warn(`Configuration file not found: ${this.options.configPath}`);
        this.config = { bmad_config: { version: '2.0', federated_knowledge: {} } };
        return;
      }

      this.config = await this.configValidator.loadConfigFile(this.options.configPath);
      await this.configValidator.validate(this.config);
      
      this.logger.info(`Configuration loaded from ${this.options.configPath}`);
    } catch (error) {
      this.logger.error('Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * Initialize federated repositories from configuration
   * @returns {Promise<void>}
   */
  async initializeFederatedRepos() {
    const federatedKnowledge = this.config?.bmad_config?.federated_knowledge || {};
    
    for (const [name, config] of Object.entries(federatedKnowledge)) {
      try {
        await this.configValidator.validateRepositoryConfig(config);
        this.federatedRepos.set(name, {
          ...config,
          name,
          status: 'initialized',
          lastSync: null,
          syncInProgress: false
        });
        
        this.logger.debug(`Initialized federated repository: ${name}`);
      } catch (error) {
        this.logger.error(`Failed to initialize repository ${name}:`, error);
      }
    }

    this.logger.info(`Initialized ${this.federatedRepos.size} federated repositories`);
  }

  /**
   * Resolve knowledge dependencies for an agent
   * @param {Object} agentConfig - Agent configuration
   * @returns {Promise<Object>} Resolved knowledge sources
   */
  async resolveKnowledge(agentConfig) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      this.logger.info('Resolving knowledge dependencies...');
      
      const knowledgeSources = [];

      // 1. Load federated knowledge first
      for (const [name, config] of this.federatedRepos.entries()) {
        try {
          await this.syncRepository(name, config);
          knowledgeSources.push({
            path: config.local_cache,
            priority: config.priority,
            source: 'federated',
            repo: name,
            config
          });
        } catch (error) {
          this.logger.error(`Failed to sync repository ${name}:`, error);
          // Continue with other repositories
        }
      }

      // 2. Add local knowledge
      const localKnowledge = this.config?.bmad_config?.local_knowledge;
      if (localKnowledge) {
        for (const [type, localPath] of Object.entries(localKnowledge)) {
          const exists = await fs.pathExists(localPath);
          if (exists) {
            knowledgeSources.push({
              path: localPath,
              priority: 999, // Always highest unless overridden
              source: 'local',
              type
            });
          }
        }
      }

      // 3. Resolve conflicts by priority and merge sources
      const mergedKnowledge = await this.knowledgeMerger.mergeKnowledgeSources(
        knowledgeSources,
        agentConfig?.dependencies || []
      );

      this.logger.info(`Knowledge resolution completed. Merged ${knowledgeSources.length} sources`);
      
      return {
        sources: knowledgeSources,
        merged: mergedKnowledge,
        resolvedAt: new Date().toISOString(),
        agentConfig
      };
    } catch (error) {
      this.logger.error('Failed to resolve knowledge dependencies:', error);
      throw error;
    }
  }

  /**
   * Sync a repository if needed
   * @param {string} name - Repository name
   * @param {Object} config - Repository configuration
   * @returns {Promise<Object>} Sync result
   */
  async syncRepository(name, config) {
    try {
      // Check if sync is needed
      if (!this.shouldSync(name, config)) {
        this.logger.debug(`Skipping sync for ${name} - not needed`);
        return { status: 'skipped', reason: 'sync not needed' };
      }

      // Check if sync is already in progress
      if (config.syncInProgress) {
        this.logger.warn(`Sync already in progress for ${name}`);
        return { status: 'in_progress' };
      }

      // Mark sync as in progress
      config.syncInProgress = true;
      
      this.logger.info(`Syncing repository: ${name}`);
      
      const result = await this.gitManager.syncRepo(
        config.repo,
        config.local_cache,
        config.branch || 'main',
        config.auth
      );

      // Update sync timestamp
      config.lastSync = Date.now();
      config.status = result.status;
      
      this.logger.info(`Repository ${name} sync completed with status: ${result.status}`);
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to sync repository ${name}:`, error);
      config.status = 'error';
      throw error;
    } finally {
      config.syncInProgress = false;
    }
  }

  /**
   * Check if repository should be synced
   * @param {string} name - Repository name
   * @param {Object} config - Repository configuration
   * @returns {boolean} Whether sync is needed
   */
  shouldSync(name, config) {
    return this.gitManager.shouldSync(name, config);
  }

  /**
   * Sync all federated repositories
   * @param {boolean} force - Force sync regardless of policy
   * @returns {Promise<Object>} Sync results for all repositories
   */
  async syncAllRepositories(force = false) {
    const results = {};
    const syncPromises = [];

    this.logger.info(`Starting sync of ${this.federatedRepos.size} repositories${force ? ' (forced)' : ''}`);

    for (const [name, config] of this.federatedRepos.entries()) {
      const syncPromise = (async () => {
        try {
          let result;
          if (force) {
            result = await this.gitManager.forceSync(
              config.repo,
              config.local_cache,
              config.branch || 'main',
              config.auth
            );
          } else {
            result = await this.syncRepository(name, config);
          }
          
          results[name] = {
            status: 'success',
            ...result
          };
        } catch (error) {
          results[name] = {
            status: 'error',
            error: error.message
          };
        }
      })();

      if (this.options.parallelSync) {
        syncPromises.push(syncPromise);
      } else {
        await syncPromise;
      }
    }

    if (this.options.parallelSync && syncPromises.length > 0) {
      await Promise.all(syncPromises);
    }

    const successCount = Object.values(results).filter(r => r.status === 'success').length;
    const errorCount = Object.values(results).filter(r => r.status === 'error').length;

    this.logger.info(`Repository sync completed: ${successCount} successful, ${errorCount} failed`);

    return {
      summary: {
        total: this.federatedRepos.size,
        successful: successCount,
        failed: errorCount,
        forced: force
      },
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Add a new federated repository
   * @param {string} name - Repository name
   * @param {Object} config - Repository configuration
   * @returns {Promise<void>}
   */
  async addRepository(name, config) {
    try {
      // Validate configuration
      const validatedConfig = await this.configValidator.validateRepositoryConfig(config);
      
      // Add to federated repos
      this.federatedRepos.set(name, {
        ...validatedConfig,
        name,
        status: 'added',
        lastSync: null,
        syncInProgress: false
      });

      // Update configuration file
      if (!this.config.bmad_config.federated_knowledge) {
        this.config.bmad_config.federated_knowledge = {};
      }
      
      this.config.bmad_config.federated_knowledge[name] = validatedConfig;
      await this.saveConfiguration();

      this.logger.info(`Added federated repository: ${name}`);
      
      // Perform initial sync
      await this.syncRepository(name, this.federatedRepos.get(name));
    } catch (error) {
      this.logger.error(`Failed to add repository ${name}:`, error);
      throw error;
    }
  }

  /**
   * Remove a federated repository
   * @param {string} name - Repository name
   * @returns {Promise<void>}
   */
  async removeRepository(name) {
    try {
      const config = this.federatedRepos.get(name);
      if (!config) {
        throw new Error(`Repository ${name} not found`);
      }

      // Remove from federated repos
      this.federatedRepos.delete(name);

      // Update configuration file
      if (this.config.bmad_config.federated_knowledge) {
        delete this.config.bmad_config.federated_knowledge[name];
        await this.saveConfiguration();
      }

      // Clean up cache
      await this.gitManager.cleanCache(name);

      this.logger.info(`Removed federated repository: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to remove repository ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get status of all federated repositories
   * @returns {Promise<Object>} Repository status information
   */
  async getRepositoryStatus() {
    const status = {
      repositories: {},
      summary: {
        total: this.federatedRepos.size,
        ready: 0,
        syncing: 0,
        error: 0,
        not_synced: 0
      },
      timestamp: new Date().toISOString()
    };

    for (const [name, config] of this.federatedRepos.entries()) {
      try {
        const repoStatus = await this.gitManager.getRepoStatus(config.local_cache);
        
        status.repositories[name] = {
          ...repoStatus,
          config: {
            repo: config.repo,
            branch: config.branch,
            priority: config.priority,
            sync_policy: config.sync_policy
          },
          lastSync: config.lastSync ? new Date(config.lastSync).toISOString() : null,
          syncInProgress: config.syncInProgress
        };

        // Update summary
        if (config.syncInProgress) {
          status.summary.syncing++;
        } else if (repoStatus.status === 'error') {
          status.summary.error++;
        } else if (repoStatus.status === 'ready') {
          status.summary.ready++;
        } else {
          status.summary.not_synced++;
        }
      } catch (error) {
        status.repositories[name] = {
          status: 'error',
          error: error.message
        };
        status.summary.error++;
      }
    }

    return status;
  }

  /**
   * Save current configuration to file
   * @returns {Promise<void>}
   */
  async saveConfiguration() {
    try {
      await this.configValidator.saveConfigFile(this.config, this.options.configPath);
      this.logger.debug(`Configuration saved to ${this.options.configPath}`);
    } catch (error) {
      this.logger.error('Failed to save configuration:', error);
      throw error;
    }
  }

  /**
   * Get federated repositories map
   * @returns {Map} Federated repositories
   */
  getFederatedRepos() {
    return new Map(this.federatedRepos);
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfiguration() {
    return { ...this.config };
  }

  /**
   * Update sync timestamp for repository
   * @param {string} name - Repository name
   */
  updateSyncTimestamp(name) {
    const config = this.federatedRepos.get(name);
    if (config) {
      config.lastSync = Date.now();
    }
  }

  /**
   * Check if resolver is initialized
   * @returns {boolean} Initialization status
   */
  isInitialized() {
    return this.initialized;
  }
}

module.exports = { FederatedDependencyResolver };