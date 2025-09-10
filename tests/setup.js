// Test setup file
const fs = require('fs-extra');

// Suppress console logs during tests unless explicitly needed
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global test timeout
jest.setTimeout(30000);

// Clean up any test artifacts
afterAll(async () => {
  // Clean up any temporary directories or files created during tests
  try {
    const tempDirs = global.__TEST_TEMP_DIRS__ || [];
    for (const dir of tempDirs) {
      await fs.remove(dir);
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Helper to track temporary directories for cleanup
global.addTempDir = (dir) => {
  if (!global.__TEST_TEMP_DIRS__) {
    global.__TEST_TEMP_DIRS__ = [];
  }
  global.__TEST_TEMP_DIRS__.push(dir);
};