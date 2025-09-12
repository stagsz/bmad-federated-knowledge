const Joi = require('joi');
const yaml = require('yaml');
const fs = require('fs-extra');
const path = require('path');

/**
 * Configuration validator for BMAD Federated Knowledge System
 * Validates enhanced core-config.yaml with federated knowledge support
 */
class ConfigValidator {
  constructor() {
    this.federatedRepoSchema = Joi.object({
      repo: Joi.string().uri().required()
        .description('Git repository URL (SSH or HTTPS)'),
      branch: Joi.string().default('main')
        .description('Branch to sync from'),
      local_cache: Joi.string().required()
        .description('Local cache directory path'),
      sync_policy: Joi.string().valid('daily', 'weekly', 'on_demand', 'manual').default('weekly')
        .description('Synchronization policy'),
      priority: Joi.number().integer().min(0).max(999).default(0)
        .description('Priority for conflict resolution (higher wins)'),
      auth: Joi.object({
        type: Joi.string().valid('ssh', 'token', 'basic').default('ssh'),
        token: Joi.string().when('type', { is: 'token', then: Joi.required() }),
        username: Joi.string().when('type', { is: 'basic', then: Joi.required() }),
        password: Joi.string().when('type', { is: 'basic', then: Joi.required() })
      }).optional(),
      filters: Joi.object({
        include: Joi.array().items(Joi.string()).default([]),
        exclude: Joi.array().items(Joi.string()).default([])
      }).optional(),
      metadata: Joi.object({
        description: Joi.string(),
        maintainer: Joi.string(),
        tags: Joi.array().items(Joi.string()).default([])
      }).optional()
    });

    this.enhancedConfigSchema = Joi.object({
      bmad_config: Joi.object({
        version: Joi.string().required(),
        
        // Existing local knowledge structure
        local_knowledge: Joi.object({
          core_data: Joi.string().default('./.bmad-fks-core/core-data'),
          templates: Joi.string().default('./.bmad-fks-core/templates'),
          workflows: Joi.string().default('./.bmad-fks-core/workflows')
        }).optional(),

        // New federated knowledge structure
        federated_knowledge: Joi.object().pattern(
          Joi.string(),
          this.federatedRepoSchema
        ).optional(),

        // Global federated settings
        federated_settings: Joi.object({
          cache_root: Joi.string().default('./.bmad-cache'),
          max_cache_size: Joi.string().default('1GB'),
          sync_timeout: Joi.number().default(300),
          retry_attempts: Joi.number().default(3),
          parallel_sync: Joi.boolean().default(true),
          conflict_resolution: Joi.string().valid('priority', 'manual', 'local_wins').default('priority')
        }).optional(),

        // Existing bmad configuration
        agents: Joi.object().optional(),
        dependencies: Joi.array().optional(),
        devLoadAlwaysFiles: Joi.array().optional()
      }).required()
    });
  }

  /**
   * Validate complete configuration
   * @param {Object|string} config - Configuration object or file path
   * @returns {Promise<Object>} Validated configuration
   */
  async validate(config) {
    let configObj;

    if (typeof config === 'string') {
      configObj = await this.loadConfigFile(config);
    } else {
      configObj = config;
    }

    const { error, value } = this.enhancedConfigSchema.validate(configObj, {
      allowUnknown: true,
      stripUnknown: false
    });

    if (error) {
      throw new Error(`Configuration validation failed: ${error.details.map(d => d.message).join(', ')}`);
    }

    return value;
  }

  /**
   * Validate repository configuration
   * @param {Object} repoConfig - Repository configuration
   * @returns {Promise<Object>} Validated repository configuration
   */
  async validateRepositoryConfig(repoConfig) {
    const { error, value } = this.federatedRepoSchema.validate(repoConfig);

    if (error) {
      throw new Error(`Repository configuration validation failed: ${error.details.map(d => d.message).join(', ')}`);
    }

    return value;
  }

  /**
   * Load and parse YAML configuration file
   * @param {string} filePath - Path to configuration file
   * @returns {Promise<Object>} Parsed configuration
   */
  async loadConfigFile(filePath) {
    try {
      const configPath = path.resolve(filePath);
      const configContent = await fs.readFile(configPath, 'utf8');
      return yaml.parse(configContent);
    } catch (error) {
      throw new Error(`Failed to load configuration file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Save configuration to YAML file
   * @param {Object} config - Configuration object
   * @param {string} filePath - Output file path
   * @returns {Promise<void>}
   */
  async saveConfigFile(config, filePath) {
    try {
      const configPath = path.resolve(filePath);
      await fs.ensureDir(path.dirname(configPath));
      
      const yamlContent = yaml.stringify(config, {
        indent: 2,
        lineWidth: 120,
        minContentWidth: 20
      });
      
      await fs.writeFile(configPath, yamlContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save configuration file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Generate example configuration
   * @returns {Object} Example configuration object
   */
  generateExampleConfig() {
    return {
      bmad_config: {
        version: "2.0",
        
        local_knowledge: {
          core_data: "./.bmad-fks-core/core-data",
          templates: "./.bmad-fks-core/templates",
          workflows: "./.bmad-fks-core/workflows"
        },
        
        federated_knowledge: {
        org_standards: {
          repo: "https://github.com/goldbergyoni/nodebestpractices.git",
          branch: "master",
          local_cache: "./.bmad-fks-cache/org-standards",
          sync_policy: "daily",
          priority: 1,
          metadata: {
            description: "Organization-wide shared knowledge and standards (using Node.js best practices repo as example)",
            maintainer: "platform-team@company.com",
            tags: ["standards", "organization", "nodejs"]
          }
        },
          
        industry_templates: {
          repo: "https://github.com/cookiecutter/cookiecutter.git",
          branch: "main",
          local_cache: "./.bmad-fks-cache/industry",
          sync_policy: "weekly",
          priority: 0,
          filters: {
            include: ["*"],
            exclude: ["*.tmp", "*.log"]
          },
            metadata: {
              description: "Industry best practices and templates",
              maintainer: "bmad-community",
              tags: ["templates", "best-practices"]
            }
          },
          
       //   team_workflows: {
        //    repo: "git@gitlab.company.com:teams/backend/bmad-workflows.git",
         //   branch: "production",
         //   local_cache: "./bmad-cache/team-backend",
         //   sync_policy: "on_demand",
         //   priority: 2,
         //   auth: {
         //     type: "token",
          //    token: "${GITLAB_TOKEN}"
          //  },
          //  metadata: {
          //    description: "Team-specific workflows and configurations",
          //    maintainer: "backend-team@company.com",
          //    tags: ["workflows", "backend", "team"]
         //   }
          //}
        },
        
        federated_settings: {
          cache_root: "./bmad-cache",
          max_cache_size: "1GB",
          sync_timeout: 300,
          retry_attempts: 3,
          parallel_sync: true,
          conflict_resolution: "priority"
        }
      }
    };
  }

  /**
   * Migrate legacy configuration to federated format
   * @param {Object} legacyConfig - Legacy configuration
   * @returns {Object} Migrated configuration
   */
  migrateLegacyConfig(legacyConfig) {
    const migratedConfig = {
      bmad_config: {
        version: "2.0",
        ...legacyConfig.bmad_config,
        federated_knowledge: {},
        federated_settings: {
          cache_root: "./bmad-cache",
          max_cache_size: "1GB",
          sync_timeout: 300,
          retry_attempts: 3,
          parallel_sync: true,
          conflict_resolution: "priority"
        }
      }
    };

    return migratedConfig;
  }
}

module.exports = { ConfigValidator };