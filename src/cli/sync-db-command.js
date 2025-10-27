const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');

// Check if pdfkit is installed
let PDFDocument;
try {
  PDFDocument = require('pdfkit');
} catch (error) {
  // PDFKit will be handled as optional
  PDFDocument = null;
}

/**
 * Register the sync-db command to the CLI
 * @param {Command} program - Commander program instance
 * @param {BmadFederatedKnowledge} bmadFed - BMAD FKS instance
 */
function registerSyncDbCommand(program, bmadFed) {
  program
    .command('sync-db [knowledgeSourceName]')
    .description('Sync data from database knowledge sources and save as PDF in cache')
    .option('-a, --all', 'Sync all database knowledge sources')
    .option('-f, --force', 'Force sync even if already synced recently')
    .option('-j, --json', 'Save as JSON instead of PDF')
    .option('-m, --mock', 'Use mock data for testing (no actual database connection)')
    .on('--help', () => {
      console.log('');
      console.log('Database Query Formats:');
      console.log('  - SQL Databases: Use standard SQL query syntax');
      console.log('    Example: "SELECT * FROM employees WHERE department = \'Engineering\'"');
      console.log('');
      console.log('  - MongoDB: Can use SQL-like syntax OR JSON format:');
      console.log('    SQL-like: "SELECT * FROM employees WHERE department = \'Engineering\'"');
      console.log('    JSON format: {"collection": "employees", "filter": {"department": "Engineering"}}');
    })
    .action(async (knowledgeSourceName, options) => {
      try {
        await bmadFed.initialize();
        
        // Get knowledge sources from config
        const config = bmadFed.dependencyResolver.config;
        const knowledgeSources = config.bmad_config.knowledge_sources || {};
        const connections = config.bmad_config.connections || {};
        
        // Find database knowledge sources
        const dbSources = Object.entries(knowledgeSources)
          .filter(([name, source]) => source.type === 'database')
          .reduce((acc, [name, source]) => {
            acc[name] = source;
            return acc;
          }, {});
          
        if (Object.keys(dbSources).length === 0) {
          console.log(chalk.yellow('No database knowledge sources found.'));
          console.log(chalk.blue('Run "bmad-fed add-knowledge" to add a database knowledge source.'));
          return;
        }
        
        let sourcesToSync = [];
        
        if (knowledgeSourceName) {
          // Sync specific source
          if (!dbSources[knowledgeSourceName]) {
            console.error(chalk.red(`Database knowledge source "${knowledgeSourceName}" not found or not a database source.`));
            console.log(chalk.yellow('Available database knowledge sources:'));
            Object.keys(dbSources).forEach(name => console.log(`  - ${name}`));
            process.exit(1);
          }
          
          sourcesToSync.push([knowledgeSourceName, dbSources[knowledgeSourceName]]);
        } else if (options.all) {
          // Sync all sources
          sourcesToSync = Object.entries(dbSources);
        } else {
          // Interactive selection
          const { selectedSources } = await inquirer.prompt([
            {
              type: 'checkbox',
              name: 'selectedSources',
              message: 'Select database knowledge sources to sync:',
              choices: Object.keys(dbSources).map(name => ({
                name: `${name} (${dbSources[name].connection_ref})`,
                value: name
              })),
              validate: input => input.length > 0 || 'You must select at least one source.'
            }
          ]);
          
          sourcesToSync = selectedSources.map(name => [name, dbSources[name]]);
        }
        
        // Process each source
        for (const [name, source] of sourcesToSync) {
          const spinner = ora(`Syncing database knowledge source: ${name}`).start();
          
          try {
            // Get connection details
            const connectionRef = source.connection_ref;
            if (!connections[connectionRef]) {
              spinner.fail(chalk.red(`Connection "${connectionRef}" not found.`));
              continue;
            }
            
            const connection = connections[connectionRef];
            
            // Execute query and get data
            const data = await executeQuery(connection, source.query, options.mock);
            
            // Create cache directory if it doesn't exist
            const cacheRoot = config.bmad_config.federated_settings?.cache_root || './.bmad-fks-cache';
            const cachePath = path.join(cacheRoot, 'db-knowledge');
            await fs.ensureDir(cachePath);
            
            // Check format preference and PDFKit availability
            let outputPath;
            const useJson = options.json || !PDFDocument;
            
            if (!useJson && PDFDocument) {
              // Generate PDF
              outputPath = path.join(cachePath, `${name}.pdf`);
              await generatePdf(data, outputPath, name, source);
              spinner.succeed(chalk.green(`Database knowledge source "${name}" synced successfully!`));
              console.log(chalk.blue(`  PDF saved to: ${outputPath}`));
            } else {
              // Generate JSON output
              outputPath = path.join(cachePath, `${name}.json`);
              await fs.writeJson(outputPath, {
                metadata: {
                  name,
                  source: source,
                  query: source.query,
                  timestamp: new Date().toISOString()
                },
                data
              }, { spaces: 2 });
              spinner.succeed(chalk.green(`Database knowledge source "${name}" synced successfully!`));
              console.log(chalk.blue(`  JSON saved to: ${outputPath}`));
              
              if (!PDFDocument && !options.json) {
                console.log(chalk.yellow(`  Note: PDFKit module not found.`));
                console.log(chalk.yellow(`  To install PDFKit, run: npm install pdfkit`));
                console.log(chalk.yellow(`  Or use --json flag to always output in JSON format`));
                
                const { installPdfKit } = await inquirer.prompt([{
                  type: 'confirm',
                  name: 'installPdfKit',
                  message: 'Would you like to install PDFKit now?',
                  default: false
                }]);
                
                if (installPdfKit) {
                  await installPdfKitModule();
                }
              }
            }
          } catch (error) {
            spinner.fail(chalk.red(`Failed to sync database knowledge source "${name}"`));
            console.error(chalk.red(`  Error: ${error.message}`));
          }
        }
      } catch (error) {
        console.error(chalk.red(`Failed to sync database: ${error.message}`));
        process.exit(1);
      }
    });
}

/**
 * Execute database query based on connection type and return data
 * @param {Object} connection - Connection configuration
 * @param {string} query - SQL query or MongoDB query string
 * @returns {Promise<Array>} - Query results
 */
async function executeQuery(connection, query, useMock = false) {
  console.log(chalk.blue(`Executing query on ${connection.type} database...`));
  console.log(chalk.gray(`Connection: ${maskConnectionString(connection.connection_string)}`));
  console.log(chalk.gray(`Query: ${query}`));
  
  // Check for required database drivers
  let mongodbModule, mysqlModule, pgModule;
  try {
    // Dynamically import database drivers only when needed
    switch (connection.type) {
      case 'mongodb':
        try {
          mongodbModule = require('mongodb');
        } catch (err) {
          if (useMock || process.env.BMAD_USE_MOCK_DATA === 'true') {
            console.log(chalk.yellow('MongoDB driver not found. Using mock data for testing.'));
            return getMockData('mongodb');
          }
          throw new Error('MongoDB driver not found. Install it with: npm install mongodb');
        }
        break;
      case 'mysql':
        try {
          mysqlModule = require('mysql2/promise');
        } catch (err) {
          if (useMock || process.env.BMAD_USE_MOCK_DATA === 'true') {
            console.log(chalk.yellow('MySQL driver not found. Using mock data for testing.'));
            return getMockData('mysql');
          }
          throw new Error('MySQL driver not found. Install it with: npm install mysql2');
        }
        break;
      case 'supabase':
      case 'postgresql':
        try {
          pgModule = require('pg');
        } catch (err) {
          if (useMock || process.env.BMAD_USE_MOCK_DATA === 'true') {
            console.log(chalk.yellow('PostgreSQL driver not found. Using mock data for testing.'));
            return getMockData('postgresql');
          }
          throw new Error('PostgreSQL driver not found. Install it with: npm install pg');
        }
        break;
    }
  } catch (error) {
    console.error(chalk.red(`Database driver error: ${error.message}`));
    if (useMock || process.env.BMAD_USE_MOCK_DATA === 'true') {
      console.log(chalk.yellow(`Using mock data for testing purposes.`));
      return getMockData(connection.type);
    }
    throw error;
  }
  
  try {
    // Execute query based on database type
    switch (connection.type) {
      case 'mongodb':
        return await queryMongodb(mongodbModule, connection.connection_string, query);
      case 'mysql':
        return await queryMysql(mysqlModule, connection.connection_string, query);
      case 'supabase':
      case 'postgresql':
        return await queryPostgres(pgModule, connection.connection_string, query);
      default:
        throw new Error(`Unsupported database type: ${connection.type}`);
    }
  } catch (error) {
    console.error(chalk.red(`${connection.type} query execution error: ${error.message}`));
    
    if (useMock || process.env.BMAD_USE_MOCK_DATA === 'true') {
      console.log(chalk.yellow(`Connection failed. Using mock data for testing purposes.`));
      return getMockData(connection.type);
    }
    throw error;
  }
}

/**
 * Execute MongoDB query
 * @param {Object} mongodb - MongoDB module
 * @param {string} connectionString - MongoDB connection string
 * @param {string} queryString - Query string (can be SQL-like or MongoDB syntax)
 * @returns {Promise<Object>} - Standardized query results
 */
async function queryMongodb(mongodb, connectionString, queryString) {
  const { MongoClient } = mongodb;
  
  // Add options to ensure connection is established properly
  const client = new MongoClient(connectionString);
  
  try {
    await client.connect();
    console.log(chalk.green('Connected to MongoDB'));
    
    // Extract database name from connection string using multiple methods
    let dbName = 'admin'; // Default database
    
    try {
      // Method 1: Standard URI format extraction (mongodb://host:port/dbname)
      const standardUriMatch = connectionString.match(/\/([^/?]+)(?:\?|$)/);
      if (standardUriMatch && standardUriMatch[1] && standardUriMatch[1] !== '') {
        dbName = standardUriMatch[1];
      } 
      // Method 2: Check for appName parameter which might indicate database name
      else if (connectionString.includes('appName=')) {
        const appNameMatch = connectionString.match(/appName=([^&]+)/);
        if (appNameMatch && appNameMatch[1]) {
          dbName = appNameMatch[1];
          console.log(chalk.blue(`Using database name from appName parameter: ${dbName}`));
        }
      } 
      // Method 3: Parse MongoDB+SRV format (mongodb+srv://user:pass@cluster.mongodb.net/dbname)
      else if (connectionString.includes('mongodb+srv://')) {
        const srvParts = connectionString.split('@');
        if (srvParts.length > 1) {
          const hostAndParams = srvParts[1].split('?');
          const hostAndDb = hostAndParams[0].split('/');
          if (hostAndDb.length > 1 && hostAndDb[1] !== '') {
            dbName = hostAndDb[1];
          }
        }
      }
    } catch (err) {
      console.log(chalk.yellow(`Error extracting database name: ${err.message}`));
      console.log(chalk.yellow(`Using default database name: ${dbName}`));
    }
    
    console.log(chalk.blue(`Using database: ${dbName}`));
    const db = client.db(dbName);
    
    // Parse the query - handle both SQL-like and MongoDB syntax
    let collection = 'knowledge'; // Default collection
    let filter = {}; // Default filter (get all documents)
    let projection = null;
    let sort = {};
    let limit = 0;
    let skip = 0;
    
    // Enhanced query parsing
    if (queryString.trim().startsWith('{')) {
      // JSON format
      try {
        const queryObject = JSON.parse(queryString);
        if (queryObject.collection) {
          collection = queryObject.collection;
        }
        if (queryObject.filter) {
          filter = queryObject.filter;
        }
        if (queryObject.projection) {
          projection = queryObject.projection;
        }
        if (queryObject.sort) {
          sort = queryObject.sort;
        }
        if (queryObject.limit) {
          limit = parseInt(queryObject.limit, 10);
        }
        if (queryObject.skip) {
          skip = parseInt(queryObject.skip, 10);
        }
        
        console.log(chalk.blue('Using MongoDB JSON query format'));
      } catch (error) {
        console.log(chalk.red(`Invalid JSON query format: ${error.message}`));
        console.log(chalk.yellow('Using default query parameters'));
      }
    } else if (queryString.toLowerCase().includes('select') && queryString.toLowerCase().includes('from')) {
      // SQL-like parsing with improved functionality
      console.log(chalk.blue('Parsing SQL-like query for MongoDB'));
      
      // Extract collection name (FROM clause)
      const fromMatch = queryString.match(/from\s+([^\s;]+)/i);
      if (fromMatch && fromMatch[1]) {
        collection = fromMatch[1];
      }
      
      // Extract field selection (SELECT clause)
      const selectMatch = queryString.match(/select\s+(.+?)\s+from/i);
      if (selectMatch && selectMatch[1] && selectMatch[1] !== '*') {
        projection = {};
        const fields = selectMatch[1].split(',').map(f => f.trim());
        fields.forEach(field => {
          projection[field] = 1;
        });
      }
      
      // Handle WHERE clause for conditions
      const whereMatch = queryString.match(/where\s+(.+?)(?:order by|limit|$)/i);
      if (whereMatch && whereMatch[1]) {
        const whereClause = whereMatch[1].trim();
        // Parse conditions (supporting =, >, <, >=, <=, !=)
        const conditions = whereClause.split(/\s+and\s+/i);
        
        conditions.forEach(condition => {
          // Match field, operator and value
          const parts = condition.match(/([^\s=<>!]+)\s*(=|>|<|>=|<=|!=)\s*['"]?([^'"\s]+)['"]?/i);
          
          if (parts && parts.length === 4) {
            const [_, field, operator, value] = parts;
            let parsedValue = value;
            
            // Try to convert to number if appropriate
            if (!isNaN(value)) {
              parsedValue = Number(value);
            } else if (value.toLowerCase() === 'true') {
              parsedValue = true;
            } else if (value.toLowerCase() === 'false') {
              parsedValue = false;
            }
            
            // Map SQL operators to MongoDB operators
            switch (operator) {
              case '=': filter[field] = parsedValue; break;
              case '>': filter[field] = { $gt: parsedValue }; break;
              case '>=': filter[field] = { $gte: parsedValue }; break;
              case '<': filter[field] = { $lt: parsedValue }; break;
              case '<=': filter[field] = { $lte: parsedValue }; break;
              case '!=': filter[field] = { $ne: parsedValue }; break;
            }
          }
        });
      }
      
      // Handle ORDER BY clause
      const orderMatch = queryString.match(/order by\s+(.+?)(?:limit|$)/i);
      if (orderMatch && orderMatch[1]) {
        const orderClause = orderMatch[1].trim();
        const orderParts = orderClause.split(',');
        
        orderParts.forEach(part => {
          const [field, direction] = part.trim().split(/\s+/);
          sort[field] = direction && direction.toLowerCase() === 'desc' ? -1 : 1;
        });
      }
      
      // Handle LIMIT clause
      const limitMatch = queryString.match(/limit\s+(\d+)/i);
      if (limitMatch && limitMatch[1]) {
        limit = parseInt(limitMatch[1], 10);
      }
    } else {
      // Simple collection name
      collection = queryString;
    }
    
    console.log(chalk.blue(`Executing MongoDB query on collection: ${collection}`));
    console.log(chalk.gray(`Filter: ${JSON.stringify(filter)}`));
    if (projection) console.log(chalk.gray(`Projection: ${JSON.stringify(projection)}`));
    if (Object.keys(sort).length) console.log(chalk.gray(`Sort: ${JSON.stringify(sort)}`));
    if (limit > 0) console.log(chalk.gray(`Limit: ${limit}`));
    if (skip > 0) console.log(chalk.gray(`Skip: ${skip}`));
    
    // Build the query
    let cursor = db.collection(collection).find(filter);
    
    // Apply projection if specified
    if (projection) {
      cursor = cursor.project(projection);
    }
    
    // Apply sort if specified
    if (Object.keys(sort).length > 0) {
      cursor = cursor.sort(sort);
    }
    
    // Apply limit and skip if specified
    if (skip > 0) {
      cursor = cursor.skip(skip);
    }
    
    if (limit > 0) {
      cursor = cursor.limit(limit);
    }
    
    // Execute the query and get results
    const documents = await cursor.toArray();
    console.log(chalk.green(`Retrieved ${documents.length} documents`));
    
    // Format the results in a standardized structure
    const columns = new Set(['_id']); // Always include _id by default
    
    // Extract all unique field names from all documents
    documents.forEach(doc => {
      Object.keys(doc).forEach(key => columns.add(key));
    });
    
    // Remove _id from columns if no documents contain it
    if (documents.length > 0 && !documents[0].hasOwnProperty('_id')) {
      columns.delete('_id');
    }
    
    // Normalize the documents - ensure all have the same fields
    const normalizedRows = documents.map(doc => {
      const normalizedDoc = {};
      Array.from(columns).forEach(col => {
        normalizedDoc[col] = doc[col] !== undefined ? doc[col] : null;
        
        // Format various MongoDB data types for display
        if (normalizedDoc[col] !== null && typeof normalizedDoc[col] === 'object') {
          // Handle ObjectId
          if (normalizedDoc[col].constructor && normalizedDoc[col].constructor.name === 'ObjectId') {
            normalizedDoc[col] = normalizedDoc[col].toString();
          }
          // Handle Date objects
          else if (normalizedDoc[col] instanceof Date) {
            normalizedDoc[col] = normalizedDoc[col].toISOString();
          }
          // Handle nested objects and arrays
          else {
            try {
              normalizedDoc[col] = JSON.stringify(normalizedDoc[col]);
            } catch (e) {
              normalizedDoc[col] = '[Complex Object]';
            }
          }
        }
      });
      return normalizedDoc;
    });
    
    return {
      columns: Array.from(columns),
      rows: normalizedRows
    };
  } catch (error) {
    console.error(chalk.red(`MongoDB query error: ${error.message}`));
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Execute MySQL query
 * @param {Object} mysql - MySQL module
 * @param {string} connectionString - MySQL connection string
 * @param {string} query - SQL query
 * @returns {Promise<Object>} - Standardized query results
 */
async function queryMysql(mysql, connectionString, query) {
  // Parse connection string to connection config
  const config = parseMySqlConnectionString(connectionString);
  
  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log(chalk.green('Connected to MySQL'));
    
    const [rows] = await connection.query(query);
    
    // Get columns from the first row
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    
    return {
      columns,
      rows
    };
  } catch (error) {
    console.error(chalk.red(`MySQL query error: ${error.message}`));
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Execute PostgreSQL query
 * @param {Object} pg - PostgreSQL module
 * @param {string} connectionString - PostgreSQL connection string
 * @param {string} query - SQL query
 * @returns {Promise<Object>} - Standardized query results
 */
async function queryPostgres(pg, connectionString, query) {
  const client = new pg.Client({
    connectionString
  });
  
  try {
    await client.connect();
    console.log(chalk.green('Connected to PostgreSQL'));
    
    const result = await client.query(query);
    const rows = result.rows;
    
    // Get columns from field definitions
    const columns = result.fields.map(field => field.name);
    
    return {
      columns,
      rows
    };
  } catch (error) {
    console.error(chalk.red(`PostgreSQL query error: ${error.message}`));
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Parse MySQL connection string to connection config object
 * @param {string} connectionString - MySQL connection string
 * @returns {Object} - Connection config for mysql2
 */
function parseMySqlConnectionString(connectionString) {
  // Handle different connection string formats
  
  // Format: mysql://username:password@hostname:port/database
  if (connectionString.startsWith('mysql://')) {
    try {
      const url = new URL(connectionString);
      return {
        host: url.hostname,
        port: url.port || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.substring(1) // Remove leading slash
      };
    } catch (e) {
      // Fall through to other formats
    }
  }
  
  // Format: host=hostname;port=port;user=username;password=password;database=database
  const config = {};
  const parts = connectionString.split(';');
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      const trimmedKey = key.trim().toLowerCase();
      if (trimmedKey === 'host') config.host = value.trim();
      else if (trimmedKey === 'port') config.port = parseInt(value.trim(), 10);
      else if (trimmedKey === 'user') config.user = value.trim();
      else if (trimmedKey === 'password') config.password = value.trim();
      else if (trimmedKey === 'database') config.database = value.trim();
    }
  }
  
  return config;
}

/**
 * Generate PDF from query results
 * @param {Object} data - Query results with columns and rows
 * @param {string} filePath - Output file path
 * @param {string} sourceName - Knowledge source name
 * @param {Object} sourceConfig - Knowledge source configuration
 * @returns {Promise<void>}
 */
async function generatePdf(data, filePath, sourceName, sourceConfig) {
  // Check if PDFKit is available
  if (!PDFDocument) {
    throw new Error('PDFKit module is not installed. Install it with "npm install pdfkit"');
  }
  
  // Check if there's actual data to render
  if (!data || !data.rows || data.rows.length === 0) {
    console.log(chalk.yellow('No data found to generate PDF. Creating empty document with message.'));
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Create a new PDF document
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4',
        bufferPages: true // Enable page buffering for custom page numbering
      });
      
      // Pipe the PDF to a file
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      
      // Add title
      doc.fontSize(24).fillColor('#333333')
        .text(`Database Knowledge Source: ${sourceName}`, { 
          align: 'center'
        });
      doc.moveDown();
      
      // Add metadata
      doc.fontSize(10).fillColor('#666666');
      doc.text(`Query: ${truncateString(sourceConfig.query, 100)}`);
      doc.text(`Connection: ${sourceConfig.connection_ref}`);
      if (sourceConfig.metadata?.description) {
        doc.text(`Description: ${sourceConfig.metadata.description}`);
      }
      doc.text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown();
      
      if (!data || !data.rows || data.rows.length === 0) {
        // No data case
        doc.fontSize(14).fillColor('#FF0000')
          .text('No data found for this query.', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).fillColor('#000000')
          .text('Possible reasons:', { align: 'left' });
        doc.fontSize(10)
          .text('• The collection may be empty')
          .text('• The query filter may be too restrictive')
          .text('• The collection name may be incorrect')
          .text('• Database permissions may prevent access');
      } else {
        // We have data - render the table
        
        // Get columns and limit their display width
        const columns = data.columns;
        
        // Calculate optimal column widths based on data
        const columnWidths = calculateColumnWidths(data, columns, 500); // 500 is max table width
        
        // Table style options
        const tableOptions = {
          padding: 5,
          headerHeight: 20,
          rowHeight: 18,
          headerBg: '#EEEEEE',
          rowEvenBg: '#FFFFFF',
          rowOddBg: '#F9F9F9', 
          borderColor: '#CCCCCC',
          textColor: '#333333',
          headerColor: '#000000'
        };
        
        // Start at current position
        const startY = doc.y;
        let currentY = startY;
        
        // Draw table header
        doc.fontSize(9).fillColor(tableOptions.headerColor);
        doc.rect(50, currentY, 500, tableOptions.headerHeight)
           .fill(tableOptions.headerBg);
        
        // Draw header text
        let xPos = 50;
        columns.forEach((column, i) => {
          doc.fillColor(tableOptions.headerColor)
             .text(truncateString(column.toString(), 30),
                xPos + tableOptions.padding, 
                currentY + (tableOptions.headerHeight - 9) / 2, // Vertically center
                {
                  width: columnWidths[i] - (tableOptions.padding * 2),
                  align: 'left'
                });
          xPos += columnWidths[i];
        });
        
        currentY += tableOptions.headerHeight;
        
        // Track if we need to add a page break
        let pageBreakNeeded = false;
        
        // Add table rows
        data.rows.forEach((row, rowIndex) => {
          // Check if we need a page break (leave room for footer)
          if (currentY > doc.page.height - 50) {
            doc.addPage();
            
            // Redraw the header on the new page
            currentY = 50; // Reset Y position on new page
            
            // Draw table header
            doc.fontSize(9).fillColor(tableOptions.headerColor);
            doc.rect(50, currentY, 500, tableOptions.headerHeight)
               .fill(tableOptions.headerBg);
            
            // Draw header text
            let headerX = 50;
            columns.forEach((column, i) => {
              doc.fillColor(tableOptions.headerColor)
                 .text(truncateString(column.toString(), 30),
                    headerX + tableOptions.padding, 
                    currentY + (tableOptions.headerHeight - 9) / 2,
                    {
                      width: columnWidths[i] - (tableOptions.padding * 2),
                      align: 'left'
                    });
              headerX += columnWidths[i];
            });
            
            currentY += tableOptions.headerHeight;
          }
          
          // Draw row background
          const rowBg = rowIndex % 2 === 0 ? tableOptions.rowEvenBg : tableOptions.rowOddBg;
          doc.rect(50, currentY, 500, tableOptions.rowHeight)
             .fill(rowBg)
             .strokeColor(tableOptions.borderColor)
             .lineWidth(0.5)
             .stroke();
          
          // Draw row data
          xPos = 50;
          columns.forEach((column, i) => {
            const cellValue = formatCellValue(row[column]);
            
            doc.fontSize(8).fillColor(tableOptions.textColor)
               .text(cellValue,
                  xPos + tableOptions.padding,
                  currentY + (tableOptions.rowHeight - 8) / 2, // Vertically center
                  {
                    width: columnWidths[i] - (tableOptions.padding * 2),
                    align: 'left'
                  });
            xPos += columnWidths[i];
          });
          
          currentY += tableOptions.rowHeight;
        });
        
        // Add summary footer
        doc.moveDown(2);
        doc.fontSize(10).fillColor('#333333')
           .text(`Total records: ${data.rows.length}`, { align: 'right' });
      }
      
      // Add page numbers
      const pageCount = doc.bufferedPageCount;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor('#666666')
           .text(`Page ${i + 1} of ${pageCount}`, 
                50, doc.page.height - 50, 
                { align: 'center', width: doc.page.width - 100 });
      }
      
      // Finalize the PDF
      doc.end();
      
      // Wait for the stream to finish
      stream.on('finish', () => {
        resolve();
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Format cell value for PDF display
 * @param {any} value - Cell value from data row
 * @returns {string} Formatted value
 */
function formatCellValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  
  if (typeof value === 'object') {
    // Handle special cases (Date, ObjectId, etc.)
    if (value instanceof Date) {
      return value.toLocaleString();
    }
    
    // For regular objects or arrays, stringify with limited depth
    try {
      return JSON.stringify(value, null, 0).substring(0, 50);
    } catch (e) {
      return '[Object]';
    }
  }
  
  return String(value).substring(0, 50); // Limit length
}

/**
 * Calculate optimal column widths based on content
 * @param {Object} data - The data object with rows and columns
 * @param {Array} columns - Column names
 * @param {number} maxWidth - Maximum table width
 * @returns {Array} Array of column widths
 */
function calculateColumnWidths(data, columns, maxWidth) {
  // Default minimum width for each column
  const minWidth = 50;
  
  // Get content width approximation for each column
  const contentWidths = columns.map(col => {
    let maxContentWidth = col.toString().length * 6; // Approximate char width
    
    // Check sample of rows for content width (limit to first 20 rows)
    const sampleSize = Math.min(20, data.rows.length);
    for (let i = 0; i < sampleSize; i++) {
      const row = data.rows[i];
      if (row[col] !== undefined && row[col] !== null) {
        const cellStr = formatCellValue(row[col]);
        maxContentWidth = Math.max(maxContentWidth, cellStr.length * 5);
      }
    }
    
    return Math.min(maxContentWidth, 150); // Cap at 150px
  });
  
  // Get total content width
  const totalContentWidth = contentWidths.reduce((sum, width) => sum + width, 0);
  
  // If total content width is less than max width, use content widths
  if (totalContentWidth <= maxWidth) {
    return contentWidths;
  }
  
  // Otherwise, scale all columns proportionally
  const scaleFactor = maxWidth / totalContentWidth;
  return contentWidths.map(width => {
    return Math.max(minWidth, Math.floor(width * scaleFactor));
  });
}

/**
 * Truncate a string if it exceeds the maximum length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
function truncateString(str, maxLength) {
  if (!str) return '';
  str = String(str);
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
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

/**
 * Get mock data for testing
 * @param {string} dbType - Database type
 * @returns {Object} Mock data
 */
function getMockData(dbType) {
  console.log(chalk.yellow('Using mock data for testing purposes.'));
  
  // Different mock data based on database type
  switch (dbType) {
    case 'mongodb':
      return {
        columns: ['_id', 'name', 'email', 'active', 'role', 'last_login', 'profile', 'tags', 'settings'],
        rows: [
          { 
            _id: '507f1f77bcf86cd799439011', 
            name: 'John Doe', 
            email: 'john.doe@example.com', 
            active: true, 
            role: 'admin', 
            last_login: new Date('2023-01-15T14:22:10Z'), 
            profile: { age: 35, department: 'IT' },
            tags: ['developer', 'backend'],
            settings: { theme: 'dark', notifications: true }
          },
          { 
            _id: '507f1f77bcf86cd799439012', 
            name: 'Jane Smith', 
            email: 'jane.smith@example.com', 
            active: true, 
            role: 'user', 
            last_login: new Date('2023-01-10T09:15:32Z'),
            profile: { age: 28, department: 'Marketing' },
            tags: ['designer', 'frontend'],
            settings: { theme: 'light', notifications: false }
          },
          { 
            _id: '507f1f77bcf86cd799439013', 
            name: 'Robert Johnson', 
            email: 'robert.johnson@example.com', 
            active: true, 
            role: 'editor', 
            last_login: new Date('2023-01-12T16:44:22Z'),
            profile: { age: 42, department: 'Editorial' },
            tags: ['content', 'editor'],
            settings: { theme: 'system', notifications: true }
          },
          { 
            _id: '507f1f77bcf86cd799439014', 
            name: 'Emily Davis', 
            email: 'emily.davis@example.com', 
            active: true, 
            role: 'user', 
            last_login: new Date('2023-01-08T11:32:45Z'),
            profile: { age: 31, department: 'Sales' },
            tags: ['sales', 'accounts'],
            settings: { theme: 'light', notifications: true }
          },
          { 
            _id: '507f1f77bcf86cd799439015', 
            name: 'Michael Brown', 
            email: 'michael.brown@example.com', 
            active: true, 
            role: 'admin', 
            last_login: new Date('2023-01-14T08:19:37Z'),
            profile: { age: 39, department: 'IT' },
            tags: ['developer', 'devops', 'infrastructure'],
            settings: { theme: 'dark', notifications: false }
          }
        ]
      };
    
    case 'mysql':
      return {
        columns: ['id', 'product_name', 'category', 'price', 'stock', 'created_at'],
        rows: [
          { id: 1, product_name: 'Laptop', category: 'Electronics', price: 999.99, stock: 50, created_at: '2023-01-05 10:00:00' },
          { id: 2, product_name: 'Smartphone', category: 'Electronics', price: 699.99, stock: 100, created_at: '2023-01-06 11:30:00' },
          { id: 3, product_name: 'Headphones', category: 'Audio', price: 149.99, stock: 200, created_at: '2023-01-07 09:15:00' },
          { id: 4, product_name: 'Monitor', category: 'Electronics', price: 349.99, stock: 30, created_at: '2023-01-08 14:45:00' },
          { id: 5, product_name: 'Keyboard', category: 'Accessories', price: 89.99, stock: 150, created_at: '2023-01-09 16:20:00' }
        ]
      };
      
    case 'postgresql':
      return {
        columns: ['order_id', 'customer_id', 'order_date', 'total_amount', 'status', 'shipping_address'],
        rows: [
          { order_id: 10001, customer_id: 5001, order_date: '2023-01-15', total_amount: 245.50, status: 'Shipped', shipping_address: '123 Main St, Anytown, USA' },
          { order_id: 10002, customer_id: 5002, order_date: '2023-01-16', total_amount: 124.99, status: 'Processing', shipping_address: '456 Oak Ave, Somewhere, USA' },
          { order_id: 10003, customer_id: 5003, order_date: '2023-01-16', total_amount: 89.75, status: 'Delivered', shipping_address: '789 Pine Rd, Nowhere, USA' },
          { order_id: 10004, customer_id: 5001, order_date: '2023-01-17', total_amount: 352.25, status: 'Shipped', shipping_address: '123 Main St, Anytown, USA' },
          { order_id: 10005, customer_id: 5004, order_date: '2023-01-18', total_amount: 78.50, status: 'Processing', shipping_address: '321 Elm Dr, Anyplace, USA' }
        ]
      };
      
    default:
      return {
        columns: ['id', 'name', 'value'],
        rows: [
          { id: 1, name: 'Sample 1', value: 'Value 1' },
          { id: 2, name: 'Sample 2', value: 'Value 2' },
          { id: 3, name: 'Sample 3', value: 'Value 3' }
        ]
      };
  }
}

/**
 * Helper function to install PDFKit module
 * @returns {Promise<boolean>} True if installation successful
 */
async function installPdfKitModule() {
  const { spawn } = require('child_process');
  
  console.log(chalk.blue('Installing PDFKit...'));
  
  return new Promise((resolve) => {
    // Determine which package manager to use
    let command = 'npm';
    let args = ['install', 'pdfkit', '--save'];
    
    // Check if this is running in a yarn project
    if (fs.existsSync('yarn.lock')) {
      command = 'yarn';
      args = ['add', 'pdfkit'];
    }
    
    const installProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });
    
    installProcess.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✓ PDFKit installed successfully!'));
        console.log(chalk.blue('Please run the command again to use PDF generation.'));
        resolve(true);
      } else {
        console.log(chalk.red(`✗ Failed to install PDFKit (exit code: ${code}).`));
        console.log(chalk.yellow('You can install it manually by running:'));
        console.log(chalk.yellow('  npm install pdfkit'));
        console.log(chalk.yellow('  or'));
        console.log(chalk.yellow('  yarn add pdfkit'));
        console.log(chalk.yellow('See docs/pdfkit-installation.md for more details.'));
        resolve(false);
      }
    });
  });
}

module.exports = { registerSyncDbCommand };