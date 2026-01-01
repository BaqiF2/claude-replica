/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/cli.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  verbose: true,
  // 默认超时时间
  testTimeout: 10000,
  // 属性测试需要更多时间
  slowTestThreshold: 5000,
  // 终端测试需要更长的超时时间，通过 setupFilesAfterEnv 配置
  // 限制并行数以避免资源竞争（终端测试）
  maxWorkers: 4,
};
