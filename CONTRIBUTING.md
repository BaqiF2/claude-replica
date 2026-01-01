# 贡献指南

感谢你对 Claude Replica 项目的关注！我们欢迎各种形式的贡献。

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发流程](#开发流程)
- [提交规范](#提交规范)
- [代码规范](#代码规范)
- [测试要求](#测试要求)
- [文档要求](#文档要求)

## 行为准则

请在参与项目时保持友善和尊重。我们致力于为所有人提供一个开放、友好的环境。

## 如何贡献

### 报告 Bug

1. 在 [Issues](https://github.com/your-username/claude-replica/issues) 中搜索是否已有相同问题
2. 如果没有，创建新 Issue
3. 使用 Bug 报告模板
4. 提供详细的复现步骤
5. 包含环境信息（Node.js 版本、操作系统等）

### 提出功能建议

1. 在 Issues 中搜索是否已有相同建议
2. 如果没有，创建新 Issue
3. 使用功能请求模板
4. 详细描述功能需求和使用场景

### 提交代码

1. Fork 仓库
2. 创建功能分支
3. 编写代码和测试
4. 确保所有测试通过
5. 提交 Pull Request

## 开发流程

### 环境设置

```bash
# 克隆仓库
git clone https://github.com/your-username/claude-replica.git
cd claude-replica

# 安装依赖
npm install

# 构建项目
npm run build

# 运行测试
npm test
```

### 分支命名

- `feature/xxx` - 新功能
- `fix/xxx` - Bug 修复
- `docs/xxx` - 文档更新
- `refactor/xxx` - 代码重构
- `test/xxx` - 测试相关

### 开发命令

```bash
# 开发模式（监听文件变化）
npm run dev

# 运行测试
npm test

# 运行测试（监听模式）
npm run test:watch

# 代码检查
npm run lint

# 代码格式化
npm run format
```

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

### 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型

| 类型 | 描述 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 代码重构 |
| `test` | 测试相关 |
| `chore` | 构建/工具相关 |
| `perf` | 性能优化 |

### 示例

```
feat(cli): add --timeout option for CI environments

Add a new --timeout option that allows users to set a maximum
execution time for queries. This is particularly useful in CI
environments where tasks should not run indefinitely.

Closes #123
```

```
fix(session): resolve session expiration check

The session expiration check was using the wrong timestamp,
causing sessions to expire prematurely.

Fixes #456
```

## 代码规范

### TypeScript

- 使用 TypeScript 严格模式
- 显式类型注解
- 避免 `any` 类型
- 使用接口定义数据结构

```typescript
// 好的做法
interface UserConfig {
  model?: string;
  maxTurns?: number;
}

function processConfig(config: UserConfig): void {
  // ...
}

// 避免
function processConfig(config: any): void {
  // ...
}
```

### 命名规范

- 类名：PascalCase（如 `SessionManager`）
- 函数/方法：camelCase（如 `createSession`）
- 常量：UPPER_SNAKE_CASE（如 `MAX_SESSIONS`）
- 文件名：PascalCase（类）或 camelCase（工具）

### 注释规范

使用 JSDoc 风格：

```typescript
/**
 * 创建新会话
 * 
 * @param workingDir - 工作目录路径
 * @param config - 配置选项
 * @returns 新创建的会话
 * @throws 如果无法创建会话
 * 
 * @example
 * ```typescript
 * const session = await createSession('/path/to/project');
 * ```
 */
async function createSession(
  workingDir: string,
  config?: SessionConfig
): Promise<Session> {
  // ...
}
```

### 代码检查

提交前确保通过所有检查：

```bash
npm run lint
npm run format:check
```

## 测试要求

### 测试覆盖

- 所有新功能必须有测试
- Bug 修复应包含回归测试
- 目标测试覆盖率 > 80%

### 测试类型

1. **单元测试**: 测试单个函数/类
2. **集成测试**: 测试模块间交互
3. **属性测试**: 使用 fast-check 测试通用属性

### 测试示例

```typescript
describe('SessionManager', () => {
  describe('createSession', () => {
    it('should create a new session with unique ID', async () => {
      const manager = new SessionManager();
      const session = await manager.createSession('/test/dir');
      
      expect(session.id).toBeDefined();
      expect(session.workingDirectory).toBe('/test/dir');
    });

    it('should throw error for invalid directory', async () => {
      const manager = new SessionManager();
      
      await expect(
        manager.createSession('')
      ).rejects.toThrow('Invalid directory');
    });
  });
});
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- --testPathPattern="SessionManager"

# 查看覆盖率
npm run test:coverage
```

## 文档要求

### 代码文档

- 所有公共 API 必须有 JSDoc 注释
- 复杂逻辑应有行内注释
- README 应保持更新

### 文档更新

修改功能时，请同时更新：

1. 代码注释
2. README.md（如果影响用户）
3. docs/ 目录下的相关文档
4. CHANGELOG.md（重要变更）

## Pull Request 流程

1. **创建 PR**
   - 使用 PR 模板
   - 描述变更内容
   - 关联相关 Issue

2. **代码审查**
   - 至少需要一个审查者批准
   - 解决所有审查意见
   - 确保 CI 检查通过

3. **合并**
   - 使用 Squash and merge
   - 确保提交信息符合规范

## 发布流程

发布由维护者负责：

1. 更新版本号
2. 更新 CHANGELOG
3. 创建 Release Tag
4. 发布到 npm

## 获取帮助

- 📖 [文档](docs/)
- 💬 [Discussions](https://github.com/BaqiF2/claude-replica/discussions)
- 🐛 [Issues](https://github.com/BaqiF2/claude-replica/issues)

感谢你的贡献！🎉
