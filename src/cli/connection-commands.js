const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { ConfigValidator } = require('../schemas/config-validator');

/**
 * Connection management commands
 */
function registerConnectionCommands(program, bmadFed) {
  const configValidator = new ConfigValidator();

  /**
   * Add connection command
   */
  program
    .command('connection-add <name>')
    .description('Add a new database connection')
    .option('-t, --type <type>', 'Database type (mysql, postgresql, mongodb, etc.)')
    .option('-s, --connection-string <string>', 'Connection string')
    .option('-d, --description <text>', 'Connection description')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (name, options) => {
      try {
        await bmadFed.initialize();
        
        // Load current configuration
        const config = bmadFed.dependencyResolver.config;
        const connections = config.bmad_config.connections || {};
        
        // Check if connection with this name already exists
        if (connections[name] && !options.force) {
          const { overwrite } = await inquirer.prompt([{
            type: 'confirm',
            name: 'overwrite',
            message: `Connection "${name}" already exists. Do you want to overwrite it?`,
            default: false
          }]);
          
          if (!overwrite) {
            console.log(chalk.yellow('Connection addition cancelled.'));
            return;
          }
        }
        
        let connectionConfig = {};
        
        if (options.interactive || !options.type || !options.connectionString) {
          // === INTERACTIVE MODE ===
          const answers = await inquirer.prompt([
            {
              type: 'list',
              name: 'type',
              message: 'Select database type:',
              choices: ['mysql', 'postgresql', 'mongodb', 'oracle', 'sqlserver', 'sqlite'],
              default: options.type
            },
            {
              type: 'input',
              name: 'connectionString',
              message: 'Enter connection string:',
              validate: (input) => input.trim() !== '' || 'Connection string is required',
              default: options.connectionString
            },
            {
              type: 'input',
              name: 'description',
              message: 'Description (optional):',
              default: options.description
            }
          ]);
          
          connectionConfig = {
            type: answers.type,
            connection_string: answers.connectionString,
            ...(answers.description && { description: answers.description })
          };
        } else {
          // === NON-INTERACTIVE MODE ===
          connectionConfig = {
            type: options.type,
            connection_string: options.connectionString,
            ...(options.description && { description: options.description })
          };
        }
        
        const spinner = ora(`Adding connection: ${name}`).start();
        
        // Save the connection to the config
        if (!config.bmad_config.connections) {
          config.bmad_config.connections = {};
        }
        
        config.bmad_config.connections[name] = connectionConfig;
        
        // Save the updated config
        await configValidator.saveConfigFile(config, './bmad-fks-core/fks-core-config.yaml');
        
        spinner.succeed(chalk.green(`Connection "${name}" added successfully!`));
      } catch (error) {
        console.error(chalk.red(`Failed to add connection: ${error.message}`));
        process.exit(1);
      }
    });
    
  /**
   * List connections command
   */
  program
    .command('connection-list')
    .description('List all database connections')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      try {
        await bmadFed.initialize();
        
        // Get connections from config
        const config = bmadFed.dependencyResolver.config;
        const connections = config.bmad_config.connections || {};
        
        if (options.json) {
          console.log(JSON.stringify(connections, null, 2));
          return;
        }
        
        if (Object.keys(connections).length === 0) {
          console.log(chalk.yellow('No database connections configured.'));
          console.log(chalk.blue('Run "bmad-fed connection-add <name>" to add a connection.'));
          return;
        }
        
        console.log(chalk.blue.bold('\n🗄️  Database Connections\n'));
        
        for (const [name, config] of Object.entries(connections)) {
          console.log(`${chalk.bold(name)}`);
          console.log(`  Type: ${config.type}`);
          console.log(`  Connection: ${maskConnectionString(config.connection_string)}`);
          if (config.description) {
            console.log(`  Description: ${config.description}`);
          }
          console.log();
        }
      } catch (error) {
        console.error(chalk.red(`Failed to list connections: ${error.message}`));
        process.exit(1);
      }
    });
    
  /**
   * Remove connection command
   */
  program
    .command('connection-remove <name>')
    .description('Remove a database connection')
    .option('-f, --force', 'Force removal without confirmation')
    .action(async (name, options) => {
      try {
        await bmadFed.initialize();
        
        // Load current configuration
        const config = bmadFed.dependencyResolver.config;
        const connections = config.bmad_config.connections || {};
        
        // Check if connection exists
        if (!connections[name]) {
          console.error(chalk.red(`Connection "${name}" does not exist.`));
          process.exit(1);
        }
        
        // Check for dependencies before removal
        const knowledgeSources = config.bmad_config.knowledge_sources || {};
        const dependencies = [];
        
        for (const [sourceName, sourceConfig] of Object.entries(knowledgeSources)) {
          if (sourceConfig.type === 'database' && sourceConfig.connection_ref === name) {
            dependencies.push(sourceName);
          }
        }
        
        if (dependencies.length > 0) {
          console.log(chalk.yellow(`WARNING: Connection "${name}" is used by the following knowledge sources:`));
          dependencies.forEach(dep => console.log(`  - ${dep}`));
          
          if (!options.force) {
            const { confirm } = await inquirer.prompt([{
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to remove connection "${name}"? This will break ${dependencies.length} knowledge source(s).`,
              default: false
            }]);
            
            if (!confirm) {
              console.log(chalk.yellow('Removal cancelled.'));
              return;
            }
          }
        } else if (!options.force) {
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to remove connection "${name}"?`,
            default: false
          }]);
          
          if (!confirm) {
            console.log(chalk.yellow('Removal cancelled.'));
            return;
          }
        }
        
        const spinner = ora(`Removing connection: ${name}`).start();
        
        // Remove the connection from the config
        delete config.bmad_config.connections[name];
        
        // If no connections left, remove the connections section
        if (Object.keys(config.bmad_config.connections).length === 0) {
          delete config.bmad_config.connections;
        }
        
        // Save the updated config
        await configValidator.saveConfigFile(config, './bmad-fks-core/fks-core-config.yaml');
        
        spinner.succeed(chalk.green(`Connection "${name}" removed successfully!`));
        
        if (dependencies.length > 0) {
          console.log(chalk.yellow(`WARNING: The following knowledge sources need to be updated:`));
          dependencies.forEach(dep => console.log(`  - ${dep}`));
        }
      } catch (error) {
        console.error(chalk.red(`Failed to remove connection: ${error.message}`));
        process.exit(1);
      }
    });
}

/**
 * Helper to mask connection string for display
 * @param {string} connectionString - The connection string to mask
 * @returns {string} - Masked connection string
 */
function maskConnectionString(connectionString) {
  if (!connectionString) return '';
  
  // Try to mask password in common connection string formats
  try {
    // For connection strings like: protocol://user:pass@host/db
    const masked = connectionString.replace(/(\/\/[^:]+:)([^@]+)(@.+)/, '$1*****$3');
    
    // For connection strings with password=X or pwd=X
    return masked.replace(/(password|pwd)=([^;& ]+)/gi, '$1=*****');
  } catch (error) {
    // If parsing fails, return partially masked string
    return connectionString.substring(0, 10) + '...' + connectionString.substring(connectionString.length - 10);
  }
}

module.exports = { registerConnectionCommands };