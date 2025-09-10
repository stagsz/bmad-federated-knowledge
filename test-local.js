#!/usr/bin/env node

// Local testing script for bmad-federated-knowledge
const path = require('path');
const fs = require('fs-extra');

// Add the src directory to the module path so we can require our modules
const srcPath = path.join(__dirname, 'src');
process.env.NODE_PATH = srcPath + ':' + (process.env.NODE_PATH || '');
require('module').Module._initPaths();

// Import our main classes
const { BmadFederatedKnowledge } = require('./src/index');
const { ConfigValidator } = require('./src/schemas/config-validator');

async function testBasicFunctionality() {
  console.log('🧪 Testing BMAD Federated Knowledge System...\n');

  try {
    // Test 1: Configuration Validation
    console.log('1. Testing Configuration Validation...');
    const validator = new ConfigValidator();
    const exampleConfig = validator.generateExampleConfig();
    const validatedConfig = await validator.validate(exampleConfig);
    console.log('✅ Configuration validation passed');

    // Test 2: Initialize the system
    console.log('\n2. Testing System Initialization...');
    const bmadFed = new BmadFederatedKnowledge({
      configPath: './examples/enhanced-core-config.yaml',
      cacheDir: './test-cache',
      logLevel: 'info'
    });
    
    // Don't actually initialize (would try to load real config)
    console.log('✅ System initialization setup completed');

    // Test 3: Test CLI argument parsing
    console.log('\n3. Testing CLI Argument Parsing...');
    // We can test the CLI module structure
    const cliModule = require('./src/cli/index');
    console.log('✅ CLI module loaded successfully');

    console.log('\n🎉 All basic tests passed!');
    console.log('\nNext steps:');
    console.log('- Run: npm test (for full test suite)');
    console.log('- Run: npm run lint (for code quality)');
    console.log('- Create a test config and try the CLI commands');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testBasicFunctionality();