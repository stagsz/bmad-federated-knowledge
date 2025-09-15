# BMAD Federated Knowledge System

A Git-based federated knowledge system extension for BMAD-METHOD that enables distributed knowledge management across multiple repositories.  
You can read the associated article for this code [here](https://medium.com/@visrow/bmad-method-and-agent-as-code-scaling-federated-knowledge-architecture-d85e5fe682cb)

## 🚀 Features

- **Git-Based Architecture**: Leverage familiar Git workflows for knowledge management
- **Federated Repositories**: Distribute knowledge across multiple repositories
- **Priority-Based Conflict Resolution**: Intelligent merging with configurable priorities
- **Offline Support**: Work offline with cached local copies
- **Flexible Sync Policies**: Daily, weekly, on-demand, or manual synchronization
- **CLI Management**: Comprehensive command-line interface for repository management
- **Seamless Integration**: Extends existing BMAD-METHOD functionality

## 🗺️ Future Roadmap

- [ ] Web UI for repository management
- [ ] Advanced conflict resolution strategies
- [ ] Repository templates and scaffolding
- [ ] Integration with popular Git hosting services
- [ ] Performance optimizations for large repositories
- [ ] Backup and restore functionality
- [ ] Support for adding webpages, or other knowledge sources beyond git repos
- [ ] Enhanced filtering and selection of knowledge subsets
- [ ] Improved offline support and caching strategies

## 📦 Installation

```bash
npm install bmad-federated-knowledge
```

Or install globally for CLI usage:

```bash
npm install -g bmad-federated-knowledge
```

## 🏗️ Architecture

The system extends BMAD-METHOD's core configuration to support federated knowledge repositories:

```yaml
bmad_config:
  version: "2.0"
  
  # Local knowledge (existing)
  local_knowledge:
    core_data: "./.bmad-fks-core/core-data"
    templates: "./.bmad-fks-core/templates"
    workflows: "./.bmad-fks-core/workflows"
  
  # Federated knowledge repositories
  federated_knowledge:
    org_standards:
      repo: "git@github.com:company/bmad-org-standards.git"
      branch: "main"
      local_cache: "./.bmad-fks-cache/org-standards"
      sync_policy: "daily"
      priority: 1
    
    industry_templates:
      repo: "git@github.com:bmad-community/software-templates.git"
      branch: "stable"
      local_cache: "./.bmad-fks-cache/industry"
      sync_policy: "weekly"
      priority: 0
```

## 🚀 Quick Start

### 1. Initialize the System

```bash
# Initialize with default configuration
bmad-fed init

# Or specify custom config path
bmad-fed init --config ./my-config.yaml
```

### 2. Add Federated Repositories

```bash
# Interactive mode
bmad-fed add my-repo --interactive

# Command line mode
bmad-fed add my-repo \
  --repo git@github.com:company/knowledge.git \
  --branch main \
  --priority 1 \
  --sync-policy daily
```

### 3. Sync Repositories

```bash
# Sync all repositories
bmad-fed sync

# Sync specific repository
bmad-fed sync my-repo

# Force sync (ignore policies)
bmad-fed sync --force
```

### 4. Check Status

```bash
# Basic status
bmad-fed status

# Detailed status
bmad-fed status --verbose
```

### 5 . Add a webpage or other knowledge source

```bash 
npx bmad-fed add-knowledge global_warming
```
and then provide all the details

```

C:\work\comicsforall>npx bmad-fed add-knowledge global_warming
2025-09-14 09:31:02 [info]: Initializing BMAD Federated Knowledge System... {"service":"bmad-federated-knowledge"}
2025-09-14 09:31:02 [info]: Git Manager initialized with cache directory: ./.bmad-fks-cache {"service":"bmad-federated-knowledge"}
2025-09-14 09:31:02 [info]: Initializing Federated Dependency Resolver... {"service":"bmad-federated-knowledge"}
2025-09-14 09:31:02 [info]: Configuration loaded from ./.bmad-fks-core/fks-core-config.yaml {"service":"bmad-federated-knowledge"}
2025-09-14 09:31:02 [info]: Initialized 4 federated repositories {"service":"bmad-federated-knowledge"}
2025-09-14 09:31:02 [info]: Federated Dependency Resolver initialized successfully {"service":"bmad-federated-knowledge"}
2025-09-14 09:31:02 [info]: BMAD Federated Knowledge System initialized successfully {"service":"bmad-federated-knowledge"}
? Select knowledge source type: web
? Webpage URL: https://www.nrdc.org/stories/global-warming-101
? Priority (0-999): 1
? Description (optional): knowledge on global warming
- Adding knowledge source: global_warming2025-09-14 09:32:42 [info]: Added knowledge source: global_warming {"service":"bmad-federated-knowledge"}
Syncing webpage: https://www.nrdc.org/stories/global-warming-101
- Adding knowledge source: global_warmingWebpage https://www.nrdc.org/stories/global-warming-101 saved to C:\work\comicsforall\.bmad-fks-cache\global_warming.pdf
√ Knowledge source "global_warming" added successfully!
```

### 6. Resolve Knowledge

```bash
C:\work\comicsforall>npx bmad-fed sync-web global_warming
2025-09-14 09:33:47 [info]: Initializing BMAD Federated Knowledge System... {"service":"bmad-federated-knowledge"}
2025-09-14 09:33:47 [info]: Git Manager initialized with cache directory: ./.bmad-fks-cache {"service":"bmad-federated-knowledge"}
2025-09-14 09:33:47 [info]: Initializing Federated Dependency Resolver... {"service":"bmad-federated-knowledge"}
2025-09-14 09:33:47 [info]: Configuration loaded from ./.bmad-fks-core/fks-core-config.yaml {"service":"bmad-federated-knowledge"}
2025-09-14 09:33:47 [info]: Initialized 4 federated repositories {"service":"bmad-federated-knowledge"}
2025-09-14 09:33:47 [info]: Federated Dependency Resolver initialized successfully {"service":"bmad-federated-knowledge"}
2025-09-14 09:33:47 [info]: BMAD Federated Knowledge System initialized successfully {"service":"bmad-federated-knowledge"}
- Syncing repository: global_warmingSyncing webpage: https://www.nrdc.org/stories/global-warming-101
/ Syncing repository: global_warmingWebpage https://www.nrdc.org/stories/global-warming-101 saved to C:\work\comicsforall\.bmad-fks-cache\global_warming.pdf
√ Wep page "global_warming" synced successfully!

```

as you can see the webpage is saved as a pdf in the cache folder this you can use with you analyst agent as additional context

### 7. Build entire context

```bash
npx bmad-fed build-context
```

This will build the entire context from all the federated knowledge sources including webpages and git repos  this context can then be used by your agents
Context is thee single most essential element for development. An AI model's ability to produce relevant, accurate code is directly tied to its understanding of the "why" and "how" behind a task. Context isn't just the prompt you type; it is a comprehensive ecosystem

## 📚 API Usage

### Basic Usage

```javascript
const { BmadFederatedKnowledge } = require('bmad-federated-knowledge');

const bmadFed = new BmadFederatedKnowledge({
  configPath: './.bmad-fks-core/core-config.yaml',
  cacheDir: './.bmad-fks-cache',
  logLevel: 'info'
});

// Initialize the system
await bmadFed.initialize();

// Resolve knowledge for an agent
const knowledge = await bmadFed.resolveKnowledge({
  dependencies: ['templates', 'workflows']
});

// Sync all repositories
const syncResults = await bmadFed.syncAll();
```

### Advanced Configuration

```javascript
const { FederatedDependencyResolver, GitManager, KnowledgeMerger } = require('bmad-federated-knowledge');

// Custom Git Manager
const gitManager = new GitManager({
  cacheDir: './custom-cache',
  timeout: 600000, // 10 minutes
  retryAttempts: 5
});

// Custom Knowledge Merger
const knowledgeMerger = new KnowledgeMerger({
  conflictResolution: 'priority',
  mergeStrategies: {
    templates: 'priority',
    workflows: 'merge',
    data: 'manual'
  }
});

// Custom Dependency Resolver
const resolver = new FederatedDependencyResolver({
  gitManager,
  knowledgeMerger,
  parallelSync: true
});
```

## 🔧 Configuration

### Repository Configuration

Each federated repository can be configured with the following options:

```yaml
repo_name:
  repo: "git@github.com:user/repo.git"     # Repository URL (required)
  branch: "main"                           # Branch to sync (default: main)
  local_cache: "./.bmad-fks-cache/repo_name"    # Local cache path (required)
  sync_policy: "weekly"                    # Sync policy (daily|weekly|on_demand|manual)
  priority: 1                              # Priority for conflict resolution (0-999)
  
  # Authentication (optional)
  auth:
    type: "ssh"                            # ssh|token|basic
    token: "${GITHUB_TOKEN}"               # For token auth
    username: "user"                       # For basic auth
    password: "pass"                       # For basic auth
  
  # Filters (optional)
  filters:
    include: ["templates/**", "workflows/**"]
    exclude: ["*.tmp", "*.log"]
  
  # Metadata (optional)
  metadata:
    description: "Repository description"
    maintainer: "team@company.com"
    tags: ["templates", "workflows"]
```

### Global Settings

```yaml
federated_settings:
  cache_root: "./.bmad-fks-cache"               # Root cache directory
  max_cache_size: "1GB"                   # Maximum cache size
  sync_timeout: 300                       # Sync timeout in seconds
  retry_attempts: 3                       # Number of retry attempts
  parallel_sync: true                     # Enable parallel syncing
  conflict_resolution: "priority"         # priority|manual|local_wins
```

## 🔄 Sync Policies

- **daily**: Sync once per day
- **weekly**: Sync once per week
- **on_demand**: Only sync when explicitly requested
- **manual**: Never auto-sync, manual sync only

## ⚡ Conflict Resolution

The system supports three conflict resolution strategies:

1. **Priority**: Higher priority sources override lower priority ones
2. **Local Wins**: Local knowledge always takes precedence
3. **Manual**: Conflicts require manual resolution

## 📋 CLI Commands

### Repository Management

```bash
# Add repository
bmad-fed add <name> [options]

# Remove repository
bmad-fed remove <name> [--force]

# List repositories
bmad-fed list [--json]
```

### Synchronization

```bash
# Sync all repositories
bmad-fed sync [--force] [--parallel]

# Sync specific repository
bmad-fed sync <name> [--force]
```

### Status and Maintenance

```bash
# Show status
bmad-fed status [--verbose]

# Clean cache
bmad-fed clean [name] [--force]

# Validate configuration
bmad-fed validate [config-path]
```

### System Management

```bash
# Initialize system
bmad-fed init [--config path] [--force]
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 🔍 Debugging

Enable debug logging:

```javascript
const bmadFed = new BmadFederatedKnowledge({
  logLevel: 'debug'
});
```

Or set environment variable:

```bash
export BMAD_LOG_LEVEL=debug
bmad-fed status
```

## Multi-Repository Context Enhancement Workflow

When your logic spans multiple repositories, use this workflow:

Sync repositories:  

```bash 
  bmad-fed sync
```

Flatten each relevant repository:

```bash 
   npx bmad-method flatten -i .\.bmad-fks-cache\backend-templates
   npx bmad-method flatten -i .\.bmad-fks-cache\frontend-components  
   npx bmad-method flatten -i .\.bmad-fks-cache\shared-workflows
```

Use XML files for context enhancement:

Load XML files into your AI context  
Reference cross-repository knowledge  
Maintain consistency across distributed logic  
Enable intelligent code generation spanning multiple repos  

## 🤝 Contributing

1. Fork the repository
2. Make sure you dont break anything
3. Add your features :-) 
3. Submit a pull request




