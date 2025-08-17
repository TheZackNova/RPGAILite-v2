import '@testing-library/jest-dom';
import { vi, beforeAll, afterAll } from 'vitest';

// Mock Google Gemini AI for testing
if (typeof global !== 'undefined') {
  global.process = {
    ...global.process,
    env: {
      ...global.process?.env,
      API_KEY: 'test-api-key',
      GEMINI_API_KEY: 'test-api-key'
    }
  };
}

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock console.error for cleaner test output
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});