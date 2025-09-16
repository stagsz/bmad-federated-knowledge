# Building Context with BMAD Federated Knowledge System

## What is BMAD?

BMAD stands for "Breakthrough Method for Agile AI-Driven Development" - a powerful agentic framework that transforms domains through specialized AI expertise. At its core, BMAD is a four-phased context engineering approach to product development that sets the foundation for agentic product development by clarifying all connected layers of the process.

## The Challenge of Context in Microservices

Modern software systems often employ distributed microservice architectures, creating significant challenges for developers, operators, and AI assistants trying to understand the complete system. Consider a healthcare application with separate services:

- Patient records management service
- Medicine supply service 
- Billing service
- Appointment scheduling service

Each service has its own repository, data sources, APIs, and dependencies, making it difficult to maintain a unified understanding of the system especially for an AI dev agent as they work based on single repostirty and limted context

## BMAD Federated Knowledge: The Solution

The BMAD Federated Knowledge System (FKS) solves this challenge by creating a unified context layer that aggregates knowledge from multiple sources. This system enables:

- **Cross-service understanding**: Gain insights across all your microservices
- **Comprehensive context**: Combine code, documentation, databases, and external sources
- **AI-ready information**: Format knowledge in ways that LLMs can efficiently consume

## Configuration Setup

To use the BMAD Federated Knowledge System, you first need to initialize it:

```bash
bmad-fed init
```

This creates a configuration file (by default at `./.bmad-fks-core/fks-core-config.yaml`) with the following structure:

```yaml
bmad_config:
  federated_settings:
    cache_root: ./.bmad-fks-cache
    max_cache_size: 1GB
    max_file_size: 10MB
    exclude_patterns:
      - node_modules/**
      - .git/**
    token_safety_margin: 10000
    
  knowledge_sources:
    # Your knowledge sources will be configured here
    
  connections:
    # Database connections will be defined here
```

## Adding Knowledge Sources

BMAD Federated Knowledge System supports three types of knowledge sources: repositories, databases, and web sources. Here's how to add each type:

### 1. Adding Repository Sources

Use the interactive command:

```bash
bmad-fed add-knowledge
```

When prompted, select "Repository" as the knowledge type and provide:
- Name for the repository
- Git URL
- Branch (defaults to main)
- Local cache path (optional)
- Description

Or modify the config file directly:

```yaml
bmad_config:
  knowledge_sources:
    patient-service:
      type: repository
      repo: https://github.com/healthcare-org/patient-service.git
      branch: main
      local_cache: ./.bmad-fks-cache/patient-service
      metadata:
        description: "Patient records management microservice"
```

### 2. Adding Database Sources

First, add a database connection:

```bash
bmad-fed add-connection
```

Select the database type (MongoDB, MySQL, PostgreSQL) and provide connection details.

Then, add a database knowledge source:

```bash
bmad-fed add-knowledge
```

When prompted, select "Database" as the knowledge type and provide:
- Name for the database source
- Select previously added connection
- SQL query or MongoDB query
- Description

This creates a configuration like:

```yaml
bmad_config:
  connections:
    mongo-patient-db:
      type: mongodb
      connection_string: mongodb://username:password@hostname:27017/patients
      
  knowledge_sources:
    patient-demographics:
      type: database
      connection_ref: mongo-patient-db
      query: '{"collection": "patients", "filter": {"active": true}}'
      metadata:
        description: "Active patient demographics information"
```

To sync the database knowledge source and generate PDF/JSON files:

```bash
bmad-fed sync-db --all
```

Or for a specific source:

```bash
bmad-fed sync-db patient-demographics
```

Options:
- `--json`: Save as JSON instead of PDF
- `--force`: Force sync even if recently synced
- `--mock`: Use mock data for testing (without actual DB connection)

### 3. Adding Web Sources

```bash
bmad-fed add-knowledge
```

When prompted, select "Web" as the knowledge type and provide:
- Name for the web source
- URL to the web resource
- Description

This creates a configuration like:

```yaml
bmad_config:
  knowledge_sources:
    api-documentation:
      type: web
      url: https://healthcare-org.github.io/api-docs/
      metadata:
        description: "API documentation for all microservices"
```

## Building Context with Multiple Knowledge Sources

The `build-context` command is the cornerstone of the BMAD Federated Knowledge System. It aggregates information from all configured knowledge sources:

```bash
bmad-fed build-context
```

This command automatically:

1. **Syncs repositories**: Clones or updates all configured git repositories
2. **Syncs database sources**: Connects to databases, executes queries, and saves results as PDF or JSON
3. **Syncs web sources**: Downloads and processes content from configured web URLs
4. **Flattens repositories**: Converts repository code into AI-optimized XML format
5. **Generates context.md**: Creates a comprehensive map of all knowledge sources

The process looks like this:

```
$ bmad-fed build-context
✓ Repos synced: 4 successful, 0 failed
✓ Database sources sync completed.
✓ Web sources sync completed.

🔄 Flattening repo "patient-service" → ./.bmad-fks-cache/patient-service.xml
... flattening logs ...
✓ Flattened patient-service → ./.bmad-fks-cache/patient-service.xml

... more flattening logs for other repos ...

✓ Context built successfully for all repos!

📄 Context definition written to context.md
```

## Output: The Context Definition File

The generated `context.md` file maps all knowledge sources:

```markdown
# Context Definition File

This file maps each knowledge source to its file, along with descriptions.

## Repository Sources

### patient-service
- **File**: ./.bmad-fks-cache/patient-service.xml
- **Repository**: https://github.com/healthcare-org/patient-service.git
- **Description**: Patient records management microservice

... more repository sources ...

## Database Sources

### patient-demographics
- **File**: ./bmad-cache/db-knowledge/patient-demographics.pdf
- **Connection**: mongo-patient-db
- **Query**: {"collection": "patients", "filter": {"active": true}}
- **Description**: Active patient demographics information

... more database sources ...

## Web Sources

### api-documentation
- **File**: ./.bmad-fks-cache/api-documentation.pdf
- **URL**: https://healthcare-org.github.io/api-docs/
- **Description**: API documentation for all microservices

... more web sources ...
```

## Cache Structure

By default, the system uses these cache directories:

- Repository sources: `./.bmad-fks-cache/[repo-name]` and `./.bmad-fks-cache/[repo-name].xml`
- Database sources: `./bmad-cache/db-knowledge/[source-name].pdf` or `./bmad-cache/db-knowledge/[source-name].json`
- Web sources: `./.bmad-fks-cache/[source-name].pdf`

You can configure the cache root in the settings:

```yaml
bmad_config:
  federated_settings:
    cache_root: ./your-custom-cache-directory
```

## Using Built Context for Microservices Development

After running `build-context`, the unified context enables:

1. **Enhanced AI assistance**: Your IDE's AI assistant gains cross-service understanding
2. **Better design decisions**: Make informed architectural choices with complete context
3. **Dependency awareness**: Understand how services impact each other
4. **Streamlined onboarding**: Help new team members understand the entire system

## Advanced Commands

### Checking System Status

```bash
bmad-fed status
```

This displays the status of all configured knowledge sources, cache usage, and more.

### Rebuilding Specific Knowledge Sources

```bash
bmad-fed sync-source [source-name]
```

### Managing Connections

```bash
bmad-fed list-connections     # List all connections
bmad-fed test-connection [name]  # Test a specific connection
bmad-fed remove-connection [name]  # Remove a connection
```

## Troubleshooting

Common issues and solutions:

1. **Database connection errors**: 
   - Check connection strings in config
   - Ensure database drivers are installed (`npm install mongodb mysql2 pg`)
   - Use `--mock` flag to test with mock data

2. **Repository sync failures**:
   - Verify git credentials
   - Check network connectivity
   - Ensure repository URL is correct

3. **Cache directory issues**:
   - Ensure write permissions for cache directories
   - Check if paths in config are consistent

## Getting Started

To build your first federated context:

1. Install the BMAD Federated Knowledge System: `npm install -g bmad-federated-knowledge`
2. Initialize the system: `bmad-fed init`
3. Add knowledge sources: `bmad-fed add-knowledge`
4. Build context: `bmad-fed build-context`
5. Use the generated context with your preferred AI coding assistant

By leveraging the BMAD Federated Knowledge System, your microservices development can achieve a new level of cohesion and insight, even as your system grows in complexity.