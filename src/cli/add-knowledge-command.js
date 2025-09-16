const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { ConfigValidator } = require('../schemas/config-validator');

/**
 * Add knowledge command
 */
function registerAddKnowledgeCommand(program, bmadFed) {
  const configValidator = new ConfigValidator();

  program
    .command('add-knowledge <n>')
    .description('Add a new knowledge source (web, database)')
    .option('-t, --type <type>', 'Type of knowledge source (web|database)')
    // Web options
    .option('--url <url>', 'Webpage URL')
    // Database options
    .option('--connection-ref <name>', 'Reference to an existing database connection')
    .option('--query <sql>', 'SQL query for extracting knowledge')
    // Common options
    .option('-p, --priority <number>', 'Priority (0-999)', '0')
    .option('--interactive', 'Interactive mode')
    .action(async (name, options) => {
      try {
        await bmadFed.initialize();
        let sourceConfig = {};
        
        // Load current configuration to get available connections
        const config = bmadFed.dependencyResolver.config;
        const connections = config.bmad_config.connections || {};
        const connectionNames = Object.keys(connections);

        if (options.interactive || !options.type) {
          // === INTERACTIVE MODE ===
          const typeAnswer = await inquirer.prompt([
            {
              type: 'list',
              name: 'type',
              message: 'Select knowledge source type:',
              choices: ['web', 'database'],
              default: options.type
            }
          ]);
          
          let answers = { type: typeAnswer.type };
          
          if (answers.type === 'web') {
            // Web source questions
            const webAnswers = await inquirer.prompt([
              {
                type: 'input',
                name: 'url',
                message: 'Webpage URL:',
                validate: (input) => input.trim() !== '' || 'Web URL is required'
              }
            ]);
            answers = { ...answers, ...webAnswers };
          } else if (answers.type === 'database') {
            // Database source questions - First ask about connection
            let connectionRef;
            
            // First ask if they want to use existing or create new
            if (connectionNames.length > 0) {
              const connectionAnswer = await inquirer.prompt([
                {
                  type: 'list',
                  name: 'connectionChoice',
                  message: 'Do you want to use an existing connection or create a new one?',
                  choices: ['Use existing connection', 'Create new connection']
                }
              ]);
              
              if (connectionAnswer.connectionChoice === 'Use existing connection') {
                // Show list of existing connections
                const connectionSelection = await inquirer.prompt([
                  {
                    type: 'list',
                    name: 'connectionRef',
                    message: 'Select a connection:',
                    choices: connectionNames
                  }
                ]);
                connectionRef = connectionSelection.connectionRef;
              } else {
                // Create new connection
                const newConnectionAnswers = await inquirer.prompt([
                  {
                    type: 'list',
                    name: 'type',
                    message: 'Select database type:',
                    choices: ['mysql', 'postgresql', 'mongodb', 'oracle', 'sqlserver', 'sqlite']
                  },
                  {
                    type: 'input',
                    name: 'connectionName',
                    message: 'Assign a name for this connection:',
                    validate: (input) => {
                      if (input.trim() === '') return 'Connection name is required';
                      if (connectionNames.includes(input)) return 'Connection name already exists';
                      return true;
                    }
                  },
                  {
                    type: 'input',
                    name: 'connectionString',
                    message: 'Enter connection string:',
                    validate: (input) => input.trim() !== '' || 'Connection string is required'
                  },
                  {
                    type: 'input',
                    name: 'description',
                    message: 'Connection description (optional):'
                  }
                ]);
                
                // Save the new connection to the config
                if (!config.bmad_config.connections) {
                  config.bmad_config.connections = {};
                }
                
                config.bmad_config.connections[newConnectionAnswers.connectionName] = {
                  type: newConnectionAnswers.type,
                  connection_string: newConnectionAnswers.connectionString,
                  ...(newConnectionAnswers.description && { description: newConnectionAnswers.description })
                };
                
                // Save the updated config
                await configValidator.saveConfigFile(config, './bmad-fks-core/fks-core-config.yaml');
                
                console.log(chalk.green(`Connection "${newConnectionAnswers.connectionName}" added successfully!`));
                
                // Use the new connection
                connectionRef = newConnectionAnswers.connectionName;
              }
            } else {
              // No existing connections, create new one
              console.log(chalk.yellow('No existing connections found. Creating a new connection...'));
              
              const newConnectionAnswers = await inquirer.prompt([
                {
                  type: 'list',
                  name: 'type',
                  message: 'Select database type:',
                  choices: ['mysql', 'postgresql', 'mongodb', 'oracle', 'sqlserver', 'sqlite']
                },
                {
                  type: 'input',
                  name: 'connectionName',
                  message: 'Assign a name for this connection:',
                  validate: (input) => input.trim() !== '' || 'Connection name is required'
                },
                {
                  type: 'input',
                  name: 'connectionString',
                  message: 'Enter connection string:',
                  validate: (input) => input.trim() !== '' || 'Connection string is required'
                },
                {
                  type: 'input',
                  name: 'description',
                  message: 'Connection description (optional):'
                }
              ]);
              
              // Save the new connection to the config
              if (!config.bmad_config.connections) {
                config.bmad_config.connections = {};
              }
              
              config.bmad_config.connections[newConnectionAnswers.connectionName] = {
                type: newConnectionAnswers.type,
                connection_string: newConnectionAnswers.connectionString,
                ...(newConnectionAnswers.description && { description: newConnectionAnswers.description })
              };
              
              // Save the updated config
              await configValidator.saveConfigFile(config, './bmad-fks-core/fks-core-config.yaml');
              
              console.log(chalk.green(`Connection "${newConnectionAnswers.connectionName}" added successfully!`));
              
              // Use the new connection
              connectionRef = newConnectionAnswers.connectionName;
            }
            
            // Now ask about query - adapt based on database type
            let queryDefault = 'SELECT * FROM knowledge';
            let queryMessage = 'SQL query:';
            
            // Get connection type
            const connectionType = connections[connectionRef]?.type;
            
            if (connectionType === 'mongodb') {
              queryDefault = 'SELECT * FROM collection';
              queryMessage = 'Query (SQL-like syntax or JSON format):';
              
              console.log(chalk.blue('MongoDB Query Options:'));
              console.log(chalk.gray('  - SQL-like: "SELECT * FROM collection WHERE field = \'value\'"'));
              console.log(chalk.gray('  - JSON format: {"collection":"collection","filter":{"field":"value"}}'));
            }
            
            const queryAnswer = await inquirer.prompt([
              {
                type: 'input',
                name: 'query',
                message: queryMessage,
                default: queryDefault
              }
            ]);
            
            answers = { 
              ...answers, 
              connectionRef,
              query: queryAnswer.query
            };
          }
          
          // Common questions
          const commonAnswers = await inquirer.prompt([
            {
              type: 'number',
              name: 'priority',
              message: 'Priority (0-999):',
              default: parseInt(options.priority) || 0,
              validate: (input) =>
                  (input >= 0 && input <= 999) || 'Priority must be between 0 and 999'
            },
            {
              type: 'input',
              name: 'description',
              message: 'Description (optional):'
            }
          ]);
          
          answers = { ...answers, ...commonAnswers };

          sourceConfig = {
            type: answers.type,
            priority: answers.priority,
            ...(answers.url && { url: answers.url }),
            ...(answers.connectionRef && { connection_ref: answers.connectionRef }),
            ...(answers.query && { query: answers.query }),
            ...(answers.description && { metadata: { description: answers.description } })
          };
        } else {
          // === NON-INTERACTIVE MODE ===
          sourceConfig = {
            type: options.type,
            priority: parseInt(options.priority),
            ...(options.url && { url: options.url }),
            ...(options.connectionRef && { connection_ref: options.connectionRef }),
            ...(options.query && { query: options.query })
          };

          // Validate non-interactive requirements
          if (options.type === 'web' && !options.url) {
            console.error(chalk.red('Web URL is required for type=web'));
            process.exit(1);
          }
          if (options.type === 'database' && !options.connectionRef) {
            console.error(chalk.red('Connection reference is required for type=database'));
            process.exit(1);
          }
          
          // Verify that the connection reference exists
          if (options.type === 'database' && !connectionNames.includes(options.connectionRef)) {
            console.error(chalk.red(`Connection "${options.connectionRef}" does not exist`));
            console.log(chalk.yellow('Available connections:'));
            connectionNames.forEach(name => console.log(`  - ${name}`));
            process.exit(1);
          }
        }

        const spinner = ora(`Adding knowledge source: ${name}`).start();
        await bmadFed.addKnowledgeSource(name, sourceConfig);
        spinner.succeed(chalk.green(`Knowledge source "${name}" added successfully!`));
      } catch (error) {
        console.error(chalk.red(`Failed to add knowledge: ${error.message}`));
        process.exit(1);
      }
    });
}

module.exports = { registerAddKnowledgeCommand };