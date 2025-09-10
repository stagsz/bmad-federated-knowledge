const { ConfigValidator } = require('../src/schemas/config-validator');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('ConfigValidator', () => {
  let configValidator;
  let tempDir;

  beforeEach(async () => {
    configValidator = new ConfigValidator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-fed-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('validateRepositoryConfig', () => {
    test('should validate valid repository configuration', async () => {
      const validConfig = {
        repo: 'git@github.com:user/repo.git',
        branch: 'main',
        local_cache: './cache/repo',
        sync_policy: 'daily',
        priority: 1
      };

      const result = await configValidator.validateRepositoryConfig(validConfig);
      expect(result).toMatchObject(validConfig);
    });

    test('should reject invalid repository URL', async () => {
      const invalidConfig = {
        repo: 'not-a-url',
        local_cache: './cache/repo'
      };

      await expect(configValidator.validateRepositoryConfig(invalidConfig))
        .rejects.toThrow('Repository configuration validation failed');
    });

    test('should apply default values', async () => {
      const minimalConfig = {
        repo: 'https://github.com/user/repo.git',
        local_cache: './cache/repo'
      };

      const result = await configValidator.validateRepositoryConfig(minimalConfig);
      expect(result.branch).toBe('main');
      expect(result.sync_policy).toBe('weekly');
      expect(result.priority).toBe(0);
    });

    test('should validate sync policy options', async () => {
      const invalidConfig = {
        repo: 'https://github.com/user/repo.git',
        local_cache: './cache/repo',
        sync_policy: 'invalid_policy'
      };

      await expect(configValidator.validateRepositoryConfig(invalidConfig))
        .rejects.toThrow('Repository configuration validation failed');
    });

    test('should validate priority range', async () => {
      const invalidConfig = {
        repo: 'https://github.com/user/repo.git',
        local_cache: './cache/repo',
        priority: 1000
      };

      await expect(configValidator.validateRepositoryConfig(invalidConfig))
        .rejects.toThrow('Repository configuration validation failed');
    });
  });

  describe('validate', () => {
    test('should validate complete configuration', async () => {
      const validConfig = {
        bmad_config: {
          version: '2.0',
          local_knowledge: {
            core_data: './bmad-core/core-data',
            templates: './bmad-core/templates',
            workflows: './bmad-core/workflows'
          },
          federated_knowledge: {
            test_repo: {
              repo: 'https://github.com/user/repo.git',
              branch: 'main',
              local_cache: './cache/test',
              sync_policy: 'daily',
              priority: 1
            }
          },
          federated_settings: {
            cache_root: './bmad-cache',
            max_cache_size: '1GB',
            sync_timeout: 300,
            retry_attempts: 3,
            parallel_sync: true,
            conflict_resolution: 'priority'
          }
        }
      };

      const result = await configValidator.validate(validConfig);
      expect(result.bmad_config.version).toBe('2.0');
      expect(result.bmad_config.federated_knowledge.test_repo).toBeDefined();
    });

    test('should reject configuration without bmad_config', async () => {
      const invalidConfig = {
        some_other_config: {}
      };

      await expect(configValidator.validate(invalidConfig))
        .rejects.toThrow('Configuration validation failed');
    });

    test('should reject configuration without version', async () => {
      const invalidConfig = {
        bmad_config: {
          federated_knowledge: {}
        }
      };

      await expect(configValidator.validate(invalidConfig))
        .rejects.toThrow('Configuration validation failed');
    });
  });

  describe('loadConfigFile', () => {
    test('should load valid YAML file', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      const configContent = `
bmad_config:
  version: "2.0"
  federated_knowledge:
    test_repo:
      repo: "https://github.com/user/repo.git"
      local_cache: "./cache/test"
`;

      await fs.writeFile(configPath, configContent);
      const result = await configValidator.loadConfigFile(configPath);
      
      expect(result.bmad_config.version).toBe('2.0');
      expect(result.bmad_config.federated_knowledge.test_repo).toBeDefined();
    });

    test('should throw error for non-existent file', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent.yaml');
      
      await expect(configValidator.loadConfigFile(nonExistentPath))
        .rejects.toThrow('Failed to load configuration file');
    });

    test('should throw error for invalid YAML', async () => {
      const configPath = path.join(tempDir, 'invalid.yaml');
      const invalidYaml = `
bmad_config:
  version: "2.0"
  invalid_yaml: [
`;

      await fs.writeFile(configPath, invalidYaml);
      
      await expect(configValidator.loadConfigFile(configPath))
        .rejects.toThrow('Failed to load configuration file');
    });
  });

  describe('saveConfigFile', () => {
    test('should save configuration to YAML file', async () => {
      const config = {
        bmad_config: {
          version: '2.0',
          federated_knowledge: {
            test_repo: {
              repo: 'https://github.com/user/repo.git',
              local_cache: './cache/test'
            }
          }
        }
      };

      const configPath = path.join(tempDir, 'output.yaml');
      await configValidator.saveConfigFile(config, configPath);
      
      const exists = await fs.pathExists(configPath);
      expect(exists).toBe(true);
      
      const savedContent = await fs.readFile(configPath, 'utf8');
      expect(savedContent).toContain('version: "2.0"');
      expect(savedContent).toContain('test_repo:');
    });

    test('should create directory if it does not exist', async () => {
      const config = { bmad_config: { version: '2.0' } };
      const nestedPath = path.join(tempDir, 'nested', 'dir', 'config.yaml');
      
      await configValidator.saveConfigFile(config, nestedPath);
      
      const exists = await fs.pathExists(nestedPath);
      expect(exists).toBe(true);
    });
  });

  describe('generateExampleConfig', () => {
    test('should generate valid example configuration', async () => {
      const exampleConfig = configValidator.generateExampleConfig();
      
      expect(exampleConfig.bmad_config.version).toBe('2.0');
      expect(exampleConfig.bmad_config.local_knowledge).toBeDefined();
      expect(exampleConfig.bmad_config.federated_knowledge).toBeDefined();
      expect(exampleConfig.bmad_config.federated_settings).toBeDefined();
      
      // Should be valid according to schema
      const result = await configValidator.validate(exampleConfig);
      expect(result).toBeDefined();
    });

    test('should include all example repositories', () => {
      const exampleConfig = configValidator.generateExampleConfig();
      const federatedRepos = exampleConfig.bmad_config.federated_knowledge;
      
      expect(federatedRepos.org_standards).toBeDefined();
      expect(federatedRepos.industry_templates).toBeDefined();
      expect(federatedRepos.team_workflows).toBeDefined();
    });
  });

  describe('migrateLegacyConfig', () => {
    test('should migrate legacy configuration', () => {
      const legacyConfig = {
        bmad_config: {
          version: '1.0',
          local_knowledge: {
            core_data: './bmad-core/core-data'
          },
          agents: {},
          dependencies: []
        }
      };

      const migratedConfig = configValidator.migrateLegacyConfig(legacyConfig);
      
      expect(migratedConfig.bmad_config.version).toBe('2.0');
      expect(migratedConfig.bmad_config.federated_knowledge).toBeDefined();
      expect(migratedConfig.bmad_config.federated_settings).toBeDefined();
      expect(migratedConfig.bmad_config.local_knowledge).toEqual(legacyConfig.bmad_config.local_knowledge);
    });
  });
});