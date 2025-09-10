# Example: Organization Standards Repository

This example shows how to set up an organization-wide standards repository.

## Repository Structure

```
bmad-org-standards/
├── templates/
│   ├── api/
│   │   ├── rest-api.yaml
│   │   └── graphql-api.yaml
│   ├── frontend/
│   │   ├── react-component.yaml
│   │   └── vue-component.yaml
│   └── backend/
│       ├── microservice.yaml
│       └── database-schema.yaml
├── workflows/
│   ├── ci-cd/
│   │   ├── github-actions.yaml
│   │   └── gitlab-ci.yaml
│   ├── deployment/
│   │   ├── kubernetes.yaml
│   │   └── docker.yaml
│   └── testing/
│       ├── unit-tests.yaml
│       └── integration-tests.yaml
├── core-data/
│   ├── coding-standards.yaml
│   ├── security-policies.yaml
│   └── architecture-guidelines.yaml
└── core-config.yaml
```

## Configuration

Add to your `core-config.yaml`:

```yaml
bmad_config:
  version: "2.0"
  
  federated_knowledge:
    org_standards:
      repo: "git@github.com:company/bmad-org-standards.git"
      branch: "main"
      local_cache: "./bmad-cache/org-standards"
      sync_policy: "daily"
      priority: 10  # High priority for org standards
      
      metadata:
        description: "Organization-wide development standards and templates"
        maintainer: "platform-team@company.com"
        tags: ["standards", "organization", "templates"]
      
      filters:
        include: ["templates/**", "workflows/**", "core-data/**"]
        exclude: ["*.tmp", "*.log", ".git/**"]
```

## CLI Usage

```bash
# Add the repository
bmad-fed add org_standards \
  --repo git@github.com:company/bmad-org-standards.git \
  --branch main \
  --priority 10 \
  --sync-policy daily

# Sync the repository
bmad-fed sync org_standards

# Check status
bmad-fed status --verbose
```

## Template Example

`templates/api/rest-api.yaml`:

```yaml
name: "REST API Template"
description: "Standard REST API implementation template"
version: "1.0.0"
category: "api"
tags: ["rest", "api", "backend"]

parameters:
  - name: "service_name"
    type: "string"
    description: "Name of the service"
    required: true
  
  - name: "database_type"
    type: "string"
    description: "Database type"
    options: ["postgresql", "mysql", "mongodb"]
    default: "postgresql"

files:
  - path: "src/main.js"
    template: |
      const express = require('express');
      const app = express();
      
      // {{service_name}} API
      app.get('/health', (req, res) => {
        res.json({ status: 'healthy', service: '{{service_name}}' });
      });
      
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
        console.log(`{{service_name}} API running on port ${PORT}`);
      });

  - path: "package.json"
    template: |
      {
        "name": "{{service_name}}",
        "version": "1.0.0",
        "description": "{{service_name}} REST API",
        "main": "src/main.js",
        "dependencies": {
          "express": "^4.18.0"
        }
      }
```

## Workflow Example

`workflows/ci-cd/github-actions.yaml`:

```yaml
name: "GitHub Actions CI/CD"
description: "Standard GitHub Actions workflow for Node.js services"
version: "1.0.0"
category: "ci-cd"
tags: ["github", "actions", "nodejs", "ci-cd"]

files:
  - path: ".github/workflows/ci.yml"
    template: |
      name: CI/CD Pipeline
      
      on:
        push:
          branches: [ main, develop ]
        pull_request:
          branches: [ main ]
      
      jobs:
        test:
          runs-on: ubuntu-latest
          
          strategy:
            matrix:
              node-version: [16.x, 18.x, 20.x]
          
          steps:
          - uses: actions/checkout@v3
          
          - name: Use Node.js ${{ matrix.node-version }}
            uses: actions/setup-node@v3
            with:
              node-version: ${{ matrix.node-version }}
              cache: 'npm'
          
          - run: npm ci
          - run: npm run build --if-present
          - run: npm test
          
        deploy:
          needs: test
          runs-on: ubuntu-latest
          if: github.ref == 'refs/heads/main'
          
          steps:
          - uses: actions/checkout@v3
          - name: Deploy to production
            run: echo "Deploying to production..."
```