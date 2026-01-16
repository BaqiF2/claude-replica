# CLI与UI分层架构优化设计规格说明

**项目**: Claude Replica CLI优化
**版本**: 2.0.0
**日期**: 2026-01-15
**状态**: 规格说明

---

## 1. 执行摘要

本规格说明描述了对Claude Replica CLI中UI层的全面重构优化方案，旨在解决main.ts中对CLIParser/CLIOptions的直接依赖以及24处console.log/error调用违反分层架构的问题。通过创建完整的UI抽象层（UIFactory → ParserInterface/CLIOutputInterface → 实现），实现CLI解析与CLI输出与UI层的完全解耦，同时保持向后兼容性和架构扩展性。

**关键决策**:
- 一次性完成Parser抽象和CLI输出抽象的双重重构
- 移除main.ts对CLIParser和CLIOptions的直接依赖
- 迁移所有console调用到CLI输出器（24处）
- 采用统一UIFactory管理Parser和CLIOutput创建
- 支持环境变量CLAUDE_UI_TYPE配置UI类型
- 完全向后兼容，保持现有CLI行为不变

---

## 2. 问题分析

### 2.1 当前问题

**问题1: Parser抽象缺失**
- **核心问题**: main.ts直接依赖CLIParser和CLIOptions具体实现，违反依赖倒置原则
- **具体表现**: Application类构造函数中实例化CLIParser，run方法中使用CLIOptions类型
- **架构影响**: CLI解析逻辑与业务逻辑耦合，无法支持Web/GUI环境

**问题2: CLI输出耦合**
- **核心问题**: main.ts中存在24处console调用，违反分层架构原则
- **具体表现**: handleEarlyReturns方法直接使用console.log输出help/version
- **技术债务**: TODO注释显示需要UI层适配但未实施
- **架构影响**: CLI输出与UI层耦合，限制未来扩展性

### 2.2 影响范围
- **涉及文件**:
  - src/main.ts (主要重构)
  - src/cli/CLIParser.ts (抽象化)
  - src/cli/CLIOptions.ts (抽象化)
  - src/ui/ (扩展)
- **影响功能**: CLI参数解析(--help, --version)、错误输出、信息提示
- **性能影响**: 早期返回路径需要保持零开销
- **扩展影响**: 无法支持Web/GUI等非终端UI环境

---

## 3. 设计目标

### 3.1 主要目标
1. **Parser解耦**: 消除main.ts对CLIParser和CLIOptions的直接依赖，实现CLI解析抽象
2. **输出解耦**: 消除CLI输出与console.log的直接耦合，实现CLI输出抽象
3. **统一管理**: 通过UIFactory统一管理Parser和CLIOutput的创建
4. **环境配置**: 支持通过环境变量CLAUDE_UI_TYPE配置UI类型
5. **保持兼容**: 100%保持现有CLI行为不变
6. **支持扩展**: 为未来Web/GUI UI扩展奠定基础

### 3.2 非目标
- 不完全实现Web/GUI UI（预留接口，具体实现后续规划）
- 不添加复杂的扩展插件机制
- 不引入外部依赖
- 不修改现有PermissionUI相关代码
- 避免过度设计：不创建不必要的工厂层

---

## 4. 架构设计

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      main.ts                            │
│                   (业务逻辑层)                          │
└─────────────────────┬───────────────────────────────────┘
                      │ 依赖注入 (构造函数)
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    UIFactory                            │
│                (统一UI工厂)                             │
└────────────┬─────────────────────┬────────────────────┘
             │                     │
   ┌─────────▼─────────┐   ┌──────▼────────────────────┐
   │  ParserInterface  │   │      OutputInterface       │
   │  (CLI解析抽象)    │   │      (CLI输出抽象)        │
   └───────┬───────────┘   └──────────┬─────────────────┘
           │                           │
   ┌───────▼──────────────┐  ┌────────▼─────────────────┐
   │   TerminalParser     │  │      TerminalOutput       │
   │   WebParser (预留)   │  │      WebOutput (预留)     │
   │   GUIParser (预留)   │  │      GUIOutput (预留)     │
   └──────────────────────┘  └───────────────────────────┘
           │                           │
           ▼                           ▼
    ┌─────────────┐           ┌─────────────┐
    │ CLIParser   │           │ console.log │
    │ (现有实现)  │           │ (包装输出)  │
    └─────────────┘           └─────────────┘
```

**核心抽象**:
- **UIFactory**: 统一管理Parser和Output创建的工厂接口
- **ParserInterface**: 定义CLI参数解析抽象契约，返回OptionsInterface
- **OutputInterface**: 定义CLI输出抽象契约
- **环境驱动**: 通过CLAUDE_UI_TYPE环境变量选择具体实现

**简化设计原则**:
- 避免过度抽象：TerminalParser和TerminalOutput直接由TerminalUIFactory实例化
- 无需额外的工厂层：TerminalParserFactory和TerminalOutputFactory被移除
- 保持架构清晰：UIFactory提供足够的抽象层次

### 4.2 核心组件

#### ParserInterface
- **类型**: 抽象接口
- **职责**: 定义CLI参数解析标准契约
- **方法**:
  - `parse(args: string[]): OptionsInterface` - 解析命令行参数
  - `getHelpText(): string` - 获取帮助文本
  - `getVersionText(): string` - 获取版本文本
- **返回**: OptionsInterface抽象接口而非具体CLIOptions

#### OptionsInterface
- **类型**: 抽象接口
- **职责**: 定义通用CLI选项结构
- **属性**:
  - `help: boolean` - 帮助标志
  - `version: boolean` - 版本标志
  - `debug: boolean` - 调试标志
  - `[key: string]: unknown` - 扩展属性
- **扩展性**: 允许不同UI实现添加特定属性

#### OutputInterface
- **类型**: 抽象接口
- **职责**: 定义CLI输出标准方法
- **方法**:
  - `info(message: string, options?: OutputOptions): void` - 信息输出
  - `warn(message: string, options?: OutputOptions): void` - 警告输出
  - `error(message: string, options?: OutputOptions): void` - 错误输出
  - `success(message: string, options?: OutputOptions): void` - 成功输出
  - `section(title: string, options?: OutputOptions): void` - 分节输出
  - `blankLine(count?: number): void` - 空行输出
- **特点**: 支持颜色、时间戳、缩进等格式化选项

#### UIFactory
- **类型**: 抽象接口
- **职责**: 统一管理Parser和Output的创建
- **方法**:
  - `createParser(): ParserInterface` - 创建解析器实例
  - `createOutput(): OutputInterface` - 创建输出器实例
- **配置**: 通过环境变量CLAUDE_UI_TYPE自动选择实现

#### TerminalParser
- **类型**: ParserInterface实现
- **职责**: 包装现有CLIParser功能
- **特点**: 直接使用CLIParser实现，保持100%兼容性

#### TerminalOutput
- **类型**: OutputInterface实现
- **职责**: 包装console方法，保持向后兼容
- **特点**: 直接调用console.log/error，确保行为完全一致

#### TerminalUIFactory
- **类型**: UIFactory实现
- **职责**: 统一管理TerminalParser和TerminalOutput创建
- **特点**: 直接实例化TerminalParser和TerminalOutput，无需额外工厂层

### 4.3 扩展工厂注册机制

扩展现有的UIFactoryRegistry支持双重工厂：
```typescript
interface UIFactoryRegistryExtension {
  // ========== Parser工厂管理 ==========
  registerParserFactory(
    type: string,
    factory: ParserFactory
  ): void;

  createParser(
    config?: UIConfig
  ): ParserInterface;

  // ========== 输出工厂管理 ==========
  registerOutputFactory(
    type: string,
    factory: OutputFactory
  ): void;

  createOutput(
    config?: OutputConfig
  ): OutputInterface;

  // ========== 统一UI工厂管理 ==========
  registerUIFactory(
    type: string,
    factory: UIFactory
  ): void;

  createUIFactory(
    config?: UIConfig
  ): UIFactory;
}
```

**注册流程**：
1. 模块初始化时自动注册TerminalUIFactory为默认工厂
2. 支持通过环境变量CLAUDE_UI_TYPE动态选择工厂类型
3. 保持与现有PermissionUI工厂的兼容性

---

## 5. 实施计划

### 5.1 阶段划分（一次性完成）

**阶段1: 核心接口定义**
- 创建 `src/ui/parser/ParserInterface.ts`
- 创建 `src/ui/parser/OptionsInterface.ts`
- 创建 `src/ui/output/OutputInterface.ts`
- 创建 `src/ui/factories/UIFactory.ts`
- 创建类型定义和接口

**阶段2: 默认实现开发**
- 创建 `src/ui/parser/impl/TerminalParser.ts`
- 创建 `src/ui/output/impl/TerminalOutput.ts`
- 创建 `src/ui/factories/impl/TerminalUIFactory.ts`
- 实现Terminal环境下的Parser和CLI输出

**阶段3: 工厂注册扩展**
- 扩展 `src/ui/factories/UIFactoryRegistry.ts`
- 添加Parser工厂和输出工厂管理
- 注册默认TerminalUIFactory

**阶段4: Application类重构**
- 修改 `src/main.ts` - 移除CLIParser和CLIOptions依赖
- 重构Application类构造函数，注入UIFactory
- 重构run()方法，使用ParserInterface和OptionsInterface
- 重构handleEarlyReturns方法，使用抽象Parser和Output
- 迁移所有console调用到输出器（24处）

**阶段5: 测试验证**
- 单元测试：ParserInterface、OutputInterface、UIFactory
- 集成测试：CLI参数解析、UI工厂注册、环境变量配置
- 架构测试：验证main.ts无直接依赖、console调用迁移完成
- 验证：向后兼容性、性能测试

### 5.2 关键修改点

#### Application类重构
```typescript
// 修改前
import { CLIParser } from './cli/CLIParser';
import type { CLIOptions } from './cli/CLIOptions';

export class Application {
  private readonly cliParser: CLIParser;

  constructor() {
    this.cliParser = new CLIParser();
  }

  async run(args: string[]): Promise<number> {
    const options: CLIOptions = this.cliParser.parse(args);
    if (options.help) {
      console.log(this.cliParser.getHelpText());
      return 0;
    }
    // ...
  }
}

// 修改后
import { UIFactory } from './ui/factories/UIFactory';
import type { ParserInterface } from './ui/parser/ParserInterface';
import type { OptionsInterface } from './ui/parser/OptionsInterface';
import type { OutputInterface } from './ui/output/OutputInterface';

export class Application {
  private readonly parser: ParserInterface;
  private readonly output: OutputInterface;

  constructor(uiFactory: UIFactory) {
    this.parser = uiFactory.createParser();
    this.output = uiFactory.createOutput();
  }

  async run(args: string[]): Promise<number> {
    const options: OptionsInterface = this.parser.parse(args);
    if (options.help) {
      this.output.info(this.parser.getHelpText());
      return 0;
    }
    // ...
  }
}
```

#### handleEarlyReturns重构
```typescript
// 修改前
private async handleEarlyReturns(options: CLIOptions): Promise<number | null> {
  if (options.help) {
    console.log(this.cliParser.getHelpText());
    return 0;
  }
  if (options.version) {
    console.log(`claude-replica v${VERSION}`);
    return 0;
  }
}

// 修改后
private async handleEarlyReturns(
  options: OptionsInterface
): Promise<number | null> {
  if (options.help) {
    this.output.info(this.parser.getHelpText());
    return 0;
  }
  if (options.version) {
    this.output.success(`claude-replica v${VERSION}`);
    return 0;
  }
}
```

#### console调用迁移示例
```typescript
// 修改前 - 错误处理
console.error('Error:', error instanceof Error ? error.message : String(error));

// 修改后
this.output.error(
  `Error: ${error instanceof Error ? error.message : String(error)}`
);

// 修改前 - 会话列表
console.log('\nSession list:');
console.log(`  ${session.id} - ${time} ${status}`);

// 修改后
this.output.section('Session list');
this.output.keyValue(session.id, `${time} ${status}`);
```

---

## 6. 技术规范

### 6.1 代码组织

```
src/
└── ui/
    ├── parser/
    │   ├── ParserInterface.ts        # 抽象接口
    │   ├── OptionsInterface.ts       # 抽象接口
    │   └── impl/
    │       ├── TerminalParser.ts      # Terminal实现
    │       ├── WebParser.ts           # 预留：Web实现
    │       └── GUIParser.ts           # 预留：GUI实现
    ├── output/
    │   ├── OutputInterface.ts     # 抽象接口
    │   └── impl/
    │       ├── TerminalOutput.ts      # Terminal实现
    │       ├── WebOutput.ts          # 预留：Web实现
    │       └── GUIOutput.ts          # 预留：GUI实现
    └── factories/
        ├── UIFactory.ts             # 统一UI工厂接口
        ├── UIFactoryRegistry.ts     # 扩展现有注册表
        └── impl/
            ├── TerminalUIFactory.ts    # Terminal工厂实现
            ├── WebUIFactory.ts        # 预留：Web工厂
            └── GUIFactory.ts          # 预留：GUI工厂
```

### 6.2 依赖管理

**最小依赖原则**:
- ParserInterface: 无外部依赖
- OptionsInterface: 无外部依赖
- OutputInterface: 无外部依赖
- UIFactory: 仅依赖ParserInterface和OutputInterface
- TerminalParser: 仅依赖ParserInterface和CLIParser
- TerminalOutput: 仅依赖OutputInterface
- 简化设计: 无需额外的TerminalParserFactory和TerminalOutputFactory
- 不依赖SessionManager、ConfigManager等子系统
- 保持与main.ts轻量级设计一致

**依赖层次**:
```
main.ts
  → UIFactory (抽象)
    → ParserInterface (抽象) → TerminalParser → CLIParser
    → OutputInterface (抽象) → TerminalOutput → console
```

### 6.3 错误处理

- **策略**: 返回错误码
- **成功**: 返回0
- **失败**: 返回非0错误码
- **异常**: 包装为错误码返回
- **静默**: 尽可能不中断流程

### 6.4 配置设计

**环境变量配置**:
- `CLAUDE_UI_TYPE`: UI类型配置，支持 `terminal|web|gui`
- 未配置时默认使用 `terminal`

**配置文件支持** (`.claude-replica/settings.json`):
```json
{
  "ui": {
    "type": "terminal",
    "options": {
      "useColors": true,
      "timestamp": false
    }
  }
}
```

**配置优先级**:
1. 环境变量 `CLAUDE_UI_TYPE`
2. 配置文件 `ui.type`
3. 默认值 `terminal`

**工厂选择逻辑**:
```typescript
const uiType = process.env.CLAUDE_UI_TYPE ||
                config.ui?.type ||
                'terminal';

const factory = UIFactoryRegistry.getFactory(uiType);
```

---

## 7. 测试策略

### 7.1 测试范围

**单元测试**:
- ParserInterface方法测试（parse、getHelpText、getVersionText）
- OptionsInterface属性测试（help、version、debug等）
- TerminalParser行为测试（与CLIParser行为一致性）
- OutputInterface方法测试（info、warn、error、success等）
- TerminalOutput行为测试（与console行为一致性）
- UIFactory工厂测试（createParser、createOutput）
- UIFactoryRegistry扩展测试（工厂注册与检索）

**集成测试**:
- CLI参数解析测试(--help, --version)
- Parser和Output协同工作测试
- UI工厂注册测试
- 环境变量配置测试（CLAUDE_UI_TYPE）
- 早期返回性能测试
- 向后兼容性测试

**架构测试**:
- 验证main.ts无CLIParser和CLIOptions依赖
- 验证console.log/error调用迁移完成
- 测试抽象工厂模式正确性

### 7.2 测试重点

1. **完全兼容性**: 确保Parser和输出行为100%一致
2. **抽象正确性**: 验证接口隔离和依赖倒置
3. **性能保持**: 早期返回路径零额外开销
4. **错误处理**: 错误码返回正确性
5. **工厂模式**: 工厂创建和注册机制
6. **配置驱动**: 环境变量和配置文件正确性

### 7.3 验证步骤

```bash
# 1. 构建项目
npm run build

# 2. 早期返回测试
npm run start -- --help
npm run start -- --version

# 3. 验证Parser抽象
grep -r "import.*CLIParser" src/main.ts | wc -l  # 应为0
grep -r "import.*CLIOptions" src/main.ts | wc -l  # 应为0

# 4. 验证console调用迁移
grep -r "console.log" src/main.ts | wc -l  # 应为0
grep -r "console.error" src/main.ts | wc -l  # 应为0

# 5. 运行测试套件
npm test

# 6. 性能基准测试
time npm run start -- --help
```

---

## 8. 兼容性保证

### 8.1 向后兼容性

**完全兼容**:
- 帮助文本格式保持不变
- 错误信息格式保持不变
- 版本信息格式保持不变
- 颜色输出保持不变
- 换行符保持不变

**验证方法**:
- 对比优化前后输出文本
- 确保所有CLI参数行为一致
- 验证终端显示效果

### 8.2 性能兼容性

- 早期返回路径保持零开销
- CLI输出器创建开销最小化
- 无额外内存分配

---

## 9. 风险与缓解

### 9.1 识别风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 实现复杂度增加 | 中 | 中 | 最小抽象层，简化设计 |
| 向后兼容性破坏 | 高 | 低 | 全面测试，逐步迁移 |
| 性能开销增加 | 中 | 低 | 零配置，缓存机制 |
| 测试覆盖率不足 | 中 | 中 | 全面测试策略 |

### 9.2 缓解策略

1. **分阶段验证**: 每阶段完成后立即测试
2. **渐进式迁移**: 逐步替换console调用
3. **性能监控**: 基准测试确保性能
4. **回滚计划**: 保留原始实现备份

---

## 10. 未来扩展

### 10.1 长期规划

**Web UI支持**:
```typescript
class WebCLIOutput implements CLIOutputInterface {
  displayHelp(text: string): number {
    // Web环境输出
  }
}
```

**GUI UI支持**:
```typescript
class GUICLIOutput implements CLIOutputInterface {
  displayHelp(text: string): number {
    // GUI环境输出
  }
}
```

### 10.2 扩展机制

通过UIFactoryRegistry注册新工厂：
```typescript
UIFactoryRegistry.registerCLIOutput('web', new WebCLIOutputFactory());
UIFactoryRegistry.registerCLIOutput('gui', new GUICLIOutputFactory());
```

---

## 11. 成功标准

### 11.1 功能标准

- [x] 移除main.ts对CLIParser和CLIOptions的直接依赖
- [x] 所有console调用迁移到CLI输出器（24处）
- [x] CLI参数(--help, --version)正常工作
- [x] 错误输出格式保持一致
- [x] 信息提示格式保持一致

### 11.2 质量标准

- [x] 100%向后兼容性
- [x] 早期返回性能无明显影响
- [x] 测试覆盖率≥90%
- [x] 代码复杂度可控

### 11.3 架构标准

- [x] CLI解析层与UI层解耦
- [x] CLI输出层与UI层解耦
- [x] 符合现有架构模式
- [x] 支持环境变量配置
- [x] 支持未来扩展（Web/GUI UI）

---

## 12. 变更记录

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| 1.0.0 | 2026-01-15 | 初始版本：CLI输出抽象设计 | Claude Code |
| 2.0.0 | 2026-01-15 | 扩展设计：增加Parser抽象层，实现完整的UI解耦 | Claude Code |

---

## 附录

### A. 相关文档
- [项目架构文档](../../CLAUDE.md)
- [文件头文档规范](../../.claude/rules/file-header-documentation.md)
- [实施方案计划](../jiggly-brewing-boole.md)

### B. 术语表
- **Parser抽象**: ParserInterface的实现，负责CLI参数解析
- **输出器**: OutputInterface的实现，负责将文本输出到终端
- **UIFactory**: 统一管理Parser和Output创建的工厂接口
- **简化设计**: 避免过度抽象，仅创建必要的工厂层
- **工厂模式**: 使用工厂类创建对象的软件设计模式
- **依赖倒置**: 依赖抽象而非具体实现的设计原则
- **早期返回**: 在函数早期阶段返回结果，避免执行后续代码
