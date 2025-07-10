// Test setup file
// This file runs before all tests and can be used to set up global test configuration

// Set up any global test utilities or mocks here
global.console = {
  ...console,
  // Optionally silence console logs during tests
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// You can add more global setup here as needed 