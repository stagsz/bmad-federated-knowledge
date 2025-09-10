const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const { Logger } = require('./logger');

/**
 * Knowledge Merger for handling conflict resolution and source merging
 * Manages priority-based merging of knowledge sources from federated repositories
 */
class KnowledgeMerger {
  constructor(options = {}) {
    this.options = {
      conflictResolution: 'priority', // 'priority', 'manual', 'local_wins'
      mergeStrategies: {
        templates: 'priority',
        workflows: 'priority',
        data: 'merge',
        configs: 'priority'
      },
      ...options
    };

    this.logger = new Logger(options.logLevel || 'info');
    this.conflictLog = [];
  }

  /**
   * Merge knowledge sources based on priority and conflict resolution strategy
   * @param {Array} knowledgeSources - Array of knowledge source objects
   * @param {Array} dependencies - Required dependencies
   * @returns {Promise<Object>} Merged knowledge structure
   */
  async mergeKnowledgeSources(knowledgeSources, dependencies = []) {
    try {
      this.logger.info('Starting knowledge source merging process');
      
      // Sort sources by priority (highest first)
      const sortedSources = knowledgeSources.sort((a, b) => b.priority - a.priority);
      
      const mergedKnowledge = {
        sources: [],
        templates: {},
        workflows: {},
        data: {},
        configs: {},
        conflicts: [],
        metadata: {
          mergedAt: new Date().toISOString(),
          totalSources: sortedSources.length,
          strategy: this.options.conflictResolution
        }
      };

      // Process each source
      for (const source of sortedSources) {
        await this.processKnowledgeSource(source, mergedKnowledge, dependencies);
      }

      // Apply post-merge processing
      await this.postMergeProcessing(mergedKnowledge);

      this.logger.info(`Knowledge merging completed. Processed ${sortedSources.length} sources with ${mergedKnowledge.conflicts.length} conflicts`);
      
      return mergedKnowledge;
    } catch (error) {
      this.logger.error('Failed to merge knowledge sources:', error);
      throw error;
    }
  }

  /**
   * Process a single knowledge source
   * @param {Object} source - Knowledge source object
   * @param {Object} mergedKnowledge - Accumulated merged knowledge
   * @param {Array} dependencies - Required dependencies
   * @returns {Promise<void>}
   */
  async processKnowledgeSource(source, mergedKnowledge, dependencies) {
    try {
      const sourcePath = path.resolve(source.path);
      const exists = await fs.pathExists(sourcePath);

      if (!exists) {
        this.logger.warn(`Knowledge source path does not exist: ${sourcePath}`);
        return;
      }

      this.logger.debug(`Processing knowledge source: ${source.source || 'unknown'} at ${sourcePath}`);

      // Add source metadata
      mergedKnowledge.sources.push({
        name: source.repo || source.source,
        path: sourcePath,
        priority: source.priority,
        type: source.source,
        processedAt: new Date().toISOString()
      });

      // Process different knowledge types
      await this.processTemplates(sourcePath, mergedKnowledge, source);
      await this.processWorkflows(sourcePath, mergedKnowledge, source);
      await this.processData(sourcePath, mergedKnowledge, source);
      await this.processConfigs(sourcePath, mergedKnowledge, source);

    } catch (error) {
      this.logger.error(`Failed to process knowledge source ${source.path}:`, error);
      // Continue processing other sources
    }
  }

  /**
   * Process templates from a knowledge source
   * @param {string} sourcePath - Source directory path
   * @param {Object} mergedKnowledge - Merged knowledge object
   * @param {Object} source - Source metadata
   * @returns {Promise<void>}
   */
  async processTemplates(sourcePath, mergedKnowledge, source) {
    const templatesPath = path.join(sourcePath, 'templates');
    const exists = await fs.pathExists(templatesPath);

    if (!exists) return;

    try {
      const templates = await this.scanDirectory(templatesPath, ['.yaml', '.yml', '.json', '.md']);
      
      for (const template of templates) {
        const relativePath = path.relative(templatesPath, template.path);
        const key = this.normalizeKey(relativePath);

        if (mergedKnowledge.templates[key]) {
          // Handle conflict
          const conflict = await this.handleConflict(
            'template',
            key,
            mergedKnowledge.templates[key],
            template,
            source
          );
          
          if (conflict.resolution === 'replace') {
            mergedKnowledge.templates[key] = {
              ...template,
              source: source.repo || source.source,
              priority: source.priority
            };
          }
          
          mergedKnowledge.conflicts.push(conflict);
        } else {
          mergedKnowledge.templates[key] = {
            ...template,
            source: source.repo || source.source,
            priority: source.priority
          };
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process templates from ${sourcePath}:`, error);
    }
  }

  /**
   * Process workflows from a knowledge source
   * @param {string} sourcePath - Source directory path
   * @param {Object} mergedKnowledge - Merged knowledge object
   * @param {Object} source - Source metadata
   * @returns {Promise<void>}
   */
  async processWorkflows(sourcePath, mergedKnowledge, source) {
    const workflowsPath = path.join(sourcePath, 'workflows');
    const exists = await fs.pathExists(workflowsPath);

    if (!exists) return;

    try {
      const workflows = await this.scanDirectory(workflowsPath, ['.yaml', '.yml', '.json']);
      
      for (const workflow of workflows) {
        const relativePath = path.relative(workflowsPath, workflow.path);
        const key = this.normalizeKey(relativePath);

        if (mergedKnowledge.workflows[key]) {
          const conflict = await this.handleConflict(
            'workflow',
            key,
            mergedKnowledge.workflows[key],
            workflow,
            source
          );
          
          if (conflict.resolution === 'replace') {
            mergedKnowledge.workflows[key] = {
              ...workflow,
              source: source.repo || source.source,
              priority: source.priority
            };
          }
          
          mergedKnowledge.conflicts.push(conflict);
        } else {
          mergedKnowledge.workflows[key] = {
            ...workflow,
            source: source.repo || source.source,
            priority: source.priority
          };
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process workflows from ${sourcePath}:`, error);
    }
  }

  /**
   * Process data files from a knowledge source
   * @param {string} sourcePath - Source directory path
   * @param {Object} mergedKnowledge - Merged knowledge object
   * @param {Object} source - Source metadata
   * @returns {Promise<void>}
   */
  async processData(sourcePath, mergedKnowledge, source) {
    const dataPath = path.join(sourcePath, 'core-data');
    const exists = await fs.pathExists(dataPath);

    if (!exists) return;

    try {
      const dataFiles = await this.scanDirectory(dataPath, ['.yaml', '.yml', '.json']);
      
      for (const dataFile of dataFiles) {
        const relativePath = path.relative(dataPath, dataFile.path);
        const key = this.normalizeKey(relativePath);

        if (mergedKnowledge.data[key]) {
          // For data files, try to merge content if possible
          const conflict = await this.handleDataConflict(
            key,
            mergedKnowledge.data[key],
            dataFile,
            source
          );
          
          mergedKnowledge.conflicts.push(conflict);
        } else {
          mergedKnowledge.data[key] = {
            ...dataFile,
            source: source.repo || source.source,
            priority: source.priority
          };
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process data from ${sourcePath}:`, error);
    }
  }

  /**
   * Process configuration files from a knowledge source
   * @param {string} sourcePath - Source directory path
   * @param {Object} mergedKnowledge - Merged knowledge object
   * @param {Object} source - Source metadata
   * @returns {Promise<void>}
   */
  async processConfigs(sourcePath, mergedKnowledge, source) {
    const configFiles = [
      'core-config.yaml',
      'core-config.yml',
      'bmad-config.yaml',
      'bmad-config.yml'
    ];

    for (const configFile of configFiles) {
      const configPath = path.join(sourcePath, configFile);
      const exists = await fs.pathExists(configPath);

      if (exists) {
        try {
          const content = await fs.readFile(configPath, 'utf8');
          const key = this.normalizeKey(configFile);

          if (mergedKnowledge.configs[key]) {
            const conflict = await this.handleConflict(
              'config',
              key,
              mergedKnowledge.configs[key],
              { path: configPath, content },
              source
            );
            
            if (conflict.resolution === 'replace') {
              mergedKnowledge.configs[key] = {
                path: configPath,
                content,
                source: source.repo || source.source,
                priority: source.priority
              };
            }
            
            mergedKnowledge.conflicts.push(conflict);
          } else {
            mergedKnowledge.configs[key] = {
              path: configPath,
              content,
              source: source.repo || source.source,
              priority: source.priority
            };
          }
        } catch (error) {
          this.logger.error(`Failed to process config ${configPath}:`, error);
        }
      }
    }
  }

  /**
   * Handle conflicts between knowledge items
   * @param {string} type - Type of knowledge item
   * @param {string} key - Item key
   * @param {Object} existing - Existing item
   * @param {Object} incoming - Incoming item
   * @param {Object} source - Source metadata
   * @returns {Promise<Object>} Conflict resolution result
   */
  async handleConflict(type, key, existing, incoming, source) {
    const conflict = {
      type,
      key,
      timestamp: new Date().toISOString(),
      existing: {
        source: existing.source,
        priority: existing.priority
      },
      incoming: {
        source: source.repo || source.source,
        priority: source.priority
      }
    };

    // Apply conflict resolution strategy
    switch (this.options.conflictResolution) {
      case 'priority':
        if (source.priority > existing.priority) {
          conflict.resolution = 'replace';
          conflict.reason = 'Higher priority source';
        } else {
          conflict.resolution = 'keep';
          conflict.reason = 'Lower priority source';
        }
        break;

      case 'local_wins':
        if (existing.source === 'local') {
          conflict.resolution = 'keep';
          conflict.reason = 'Local source takes precedence';
        } else {
          conflict.resolution = 'replace';
          conflict.reason = 'No local source conflict';
        }
        break;

      case 'manual':
        conflict.resolution = 'manual';
        conflict.reason = 'Manual resolution required';
        break;

      default:
        conflict.resolution = 'keep';
        conflict.reason = 'Default strategy';
    }

    this.logger.debug(`Conflict resolved for ${type}:${key} - ${conflict.resolution}`);
    return conflict;
  }

  /**
   * Handle data file conflicts with potential merging
   * @param {string} key - Data key
   * @param {Object} existing - Existing data
   * @param {Object} incoming - Incoming data
   * @param {Object} source - Source metadata
   * @returns {Promise<Object>} Conflict resolution result
   */
  async handleDataConflict(key, existing, incoming, source) {
    // Try to merge data if both are JSON/YAML
    try {
      const existingContent = await this.parseContent(existing.content || existing.path);
      const incomingContent = await this.parseContent(incoming.content || incoming.path);

      if (_.isObject(existingContent) && _.isObject(incomingContent)) {
        // Attempt deep merge
        const merged = _.mergeWith(existingContent, incomingContent, (objValue, srcValue) => {
          if (_.isArray(objValue)) {
            return objValue.concat(srcValue);
          }
        });

        existing.content = JSON.stringify(merged, null, 2);
        existing.merged = true;
        existing.sources = [existing.source, source.repo || source.source];

        return {
          type: 'data',
          key,
          resolution: 'merged',
          reason: 'Successfully merged data structures',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      this.logger.debug(`Could not merge data for ${key}, falling back to priority resolution`);
    }

    // Fall back to standard conflict resolution
    return await this.handleConflict('data', key, existing, incoming, source);
  }

  /**
   * Scan directory for files with specific extensions
   * @param {string} dirPath - Directory path
   * @param {Array} extensions - File extensions to include
   * @returns {Promise<Array>} Array of file objects
   */
  async scanDirectory(dirPath, extensions = []) {
    const files = [];
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(itemPath, extensions);
          files.push(...subFiles);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (extensions.length === 0 || extensions.includes(ext)) {
            const content = await fs.readFile(itemPath, 'utf8');
            files.push({
              path: itemPath,
              name: item.name,
              extension: ext,
              content,
              size: content.length
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to scan directory ${dirPath}:`, error);
    }
    
    return files;
  }

  /**
   * Parse content as JSON or YAML
   * @param {string} contentOrPath - Content string or file path
   * @returns {Promise<Object>} Parsed content
   */
  async parseContent(contentOrPath) {
    let content = contentOrPath;
    
    if (await fs.pathExists(contentOrPath)) {
      content = await fs.readFile(contentOrPath, 'utf8');
    }

    try {
      return JSON.parse(content);
    } catch {
      try {
        const yaml = require('yaml');
        return yaml.parse(content);
      } catch {
        return content; // Return as string if parsing fails
      }
    }
  }

  /**
   * Normalize key for consistent indexing
   * @param {string} key - Original key
   * @returns {string} Normalized key
   */
  normalizeKey(key) {
    return key.replace(/\\/g, '/').toLowerCase();
  }

  /**
   * Post-merge processing
   * @param {Object} mergedKnowledge - Merged knowledge object
   * @returns {Promise<void>}
   */
  async postMergeProcessing(mergedKnowledge) {
    // Generate summary statistics
    mergedKnowledge.metadata.summary = {
      templates: Object.keys(mergedKnowledge.templates).length,
      workflows: Object.keys(mergedKnowledge.workflows).length,
      data: Object.keys(mergedKnowledge.data).length,
      configs: Object.keys(mergedKnowledge.configs).length,
      conflicts: mergedKnowledge.conflicts.length
    };

    // Log conflicts if any
    if (mergedKnowledge.conflicts.length > 0) {
      this.logger.warn(`Found ${mergedKnowledge.conflicts.length} conflicts during merge`);
      for (const conflict of mergedKnowledge.conflicts) {
        this.logger.debug(`Conflict: ${conflict.type}:${conflict.key} - ${conflict.resolution}`);
      }
    }
  }

  /**
   * Get conflict log
   * @returns {Array} Array of conflict objects
   */
  getConflictLog() {
    return [...this.conflictLog];
  }

  /**
   * Clear conflict log
   */
  clearConflictLog() {
    this.conflictLog = [];
  }
}

module.exports = { KnowledgeMerger };