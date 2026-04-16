module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/core/**/*.js', 'src/content/platform-detector.js'],
  coverageReporters: ['text', 'lcov'],
  verbose: true
};
