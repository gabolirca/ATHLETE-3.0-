module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  clearMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': '<rootDir>/../../node_modules/@babel/runtime/$1',
  },
};

