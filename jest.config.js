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
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
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
  // 测试报告输出目录
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-reports',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true,
      },
    ],
  ],
  // 终端测试配置
  projects: [
    {
      // 默认项目 - 非终端测试
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.spec.ts'],
      testPathIgnorePatterns: ['<rootDir>/tests/terminal/', '<rootDir>/tests/testing/'],
    },
    {
      // 测试框架组件测试 - 需要更长超时时间
      displayName: 'testing',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/testing/**/*.test.ts'],
      // 测试框架组件测试可以并行
      maxWorkers: 2,
    },
    {
      // 终端测试项目 - 需要更长超时时间
      displayName: 'terminal',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/terminal/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/terminal/setup.ts'],
      // 终端测试串行执行以避免资源竞争
      maxWorkers: 1,
    },
  ],
  // 限制并行数以避免资源竞争（终端测试）
  maxWorkers: 4,
};
