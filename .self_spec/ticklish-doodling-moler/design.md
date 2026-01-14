# PermissionUI 工厂模式重构设计文档

**日期**: 2026-01-14
**作者**: Claude Code Assistant
**版本**: v1.0

## 1. 执行摘要

本文档描述了对 `PermissionUIImpl` 组件的工厂模式重构方案，旨在解决当前在 `main.ts` 中直接实例化具体UI实现的问题，并为未来支持多种UI类型（终端、Web、GUI等）提供可扩展的架构基础。

## 2. 问题分析

### 2.1 当前问题

**现状**：
```typescript
// main.ts:149-154
const permissionUI = new PermissionUIImpl();
this.permissionManager = new PermissionManager(
  permissionConfig,
  permissionUI,  // 直接依赖具体实现
  this.toolRegistry
);
```

**存在问题**：
1. **违反依赖倒置原则**: main.ts 依赖具体实现而非抽象
2. **违反单一职责**: main.ts 负责应用编排，不应关心UI创建细节
3. **扩展性差**: 添加新UI类型需修改 main.ts 和 PermissionManager
4. **测试困难**: 难以mock UI层进行单元测试
5. **耦合度高**: UI实现与调用方强耦合

### 2.2 影响范围

- **主要文件**: `src/main.ts`, `src/permissions/PermissionManager.ts`
- **UI层文件**: `src/ui/PermissionUIImpl.ts`, `src/permissions/PermissionUI.ts`
- **测试文件**: 相关单元测试和集成测试
- **影响模块**: 权限管理系统、UI交互系统

## 3. 解决方案

### 3.1 设计模式选择

采用 **工厂模式（Factory Pattern）**，理由：
- ✅ 符合开闭原则：对扩展开放，对修改封闭
- ✅ 遵循依赖倒置：依赖抽象而非具体实现
- ✅ 支持配置驱动：可通过配置选择UI类型
- ✅ 简化测试：易于mock和替换
- ✅ 渐进式迁移：可分阶段重构

### 3.2 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     应用启动流程                              │
├─────────────────────────────────────────────────────────────┤
│  main.ts                                                    │
│  ├─ 创建 UI 工厂 (根据配置选择)                              │
│  ├─ 通过工厂创建 PermissionUI 实例                           │
│  └─ 注入 PermissionManager                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   UI 工厂抽象层                              │
├─────────────────────────────────────────────────────────────┤
│  PermissionUIFactory (接口)                                 │
│  ├─ createPermissionUI(): PermissionUI                    │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
┌─────────────────────┐           ┌─────────────────────┐
│  终端UI工厂          │           │  Web UI工厂         │
│  (当前实现)         │           │  (未来扩展)         │
├─────────────────────┤           ├─────────────────────┤
│ TerminalPermission  │           │ WebPermission       │
│ UIFactory          │           │ UIFactory           │
│ └─ PermissionUIImpl│           │ └─ WebPermissionUI  │
└─────────────────────┘           └─────────────────────┘
```

## 4. 详细设计

### 4.1 核心接口定义

**文件**: `src/ui/factories/PermissionUIFactory.ts`

```typescript
/**
 * PermissionUI 工厂接口
 *
 * 负责创建 PermissionUI 实例，支持多种UI类型
 */
export interface PermissionUIFactory {
  /**
   * 创建 PermissionUI 实例
   *
   * @param output 输出流（可选，默认 process.stdout）
   * @param input 输入流（可选，默认 process.stdin）
   * @returns PermissionUI 实例
   */
  createPermissionUI(
    output?: NodeJS.WritableStream,
    input?: NodeJS.ReadableStream
  ): PermissionUI;
}
```

### 4.2 终端UI工厂实现

**文件**: `src/ui/factories/TerminalPermissionUIFactory.ts`

```typescript
import { PermissionUIFactory } from './PermissionUIFactory';
import { PermissionUIImpl } from '../PermissionUIImpl';
import { PermissionUI } from '../../permissions/PermissionUI';

/**
 * 终端UI工厂
 *
 * 创建终端版本的 PermissionUI 实现
 */
export class TerminalPermissionUIFactory implements PermissionUIFactory {
  createPermissionUI(
    output: NodeJS.WritableStream = process.stdout,
    input: NodeJS.ReadableStream = process.stdin
  ): PermissionUI {
    return new PermissionUIImpl(output, input);
  }
}
```

### 4.3 配置支持

**文件**: `src/config/ConfigManager.ts` (扩展)

```typescript
interface UIConfig {
  /** UI类型 */
  type: 'terminal' | 'web' | 'gui';
  /** UI选项 */
  options?: Record<string, unknown>;
}

/** 权限配置扩展 */
interface PermissionConfig {
  mode: PermissionMode;
  ui?: UIConfig;  // 新增UI配置
  // ... 其他配置
}
```

### 4.4 PermissionManager 重构

**修改**: `src/permissions/PermissionManager.ts`

```typescript
export class PermissionManager {
  constructor(
    config: PermissionConfig,
    uiFactory: PermissionUIFactory,  // 接收工厂而非具体实现
    toolRegistry?: ToolRegistry
  ) {
    this.config = { ...config };
    // 通过工厂创建UI实例
    this.permissionUI = uiFactory.createPermissionUI();
    this.toolRegistry = toolRegistry || new ToolRegistry();
  }
}
```

### 4.5 工厂注册与解析

**文件**: `src/ui/factories/UIFactoryRegistry.ts`

```typescript
/**
 * UI工厂注册表
 *
 * 管理所有可用的UI工厂，支持按类型注册和获取
 */
export class UIFactoryRegistry {
  private static factories: Map<string, PermissionUIFactory> = new Map();

  /**
   * 注册UI工厂
   *
   * @param type UI类型
   * @param factory 工厂实例
   */
  static register(type: string, factory: PermissionUIFactory): void {
    this.factories.set(type, factory);
  }

  /**
   * 获取UI工厂
   *
   * @param type UI类型
   * @returns 工厂实例
   */
  static get(type: string): PermissionUIFactory {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`UI factory not found for type: ${type}`);
    }
    return factory;
  }

  /**
   * 根据配置创建UI工厂
   *
   * @param config UI配置
   * @returns UI工厂实例
   */
  static create(config?: UIConfig): PermissionUIFactory {
    if (!config) {
      // 默认使用终端UI
      return new TerminalPermissionUIFactory();
    }
    return this.get(config.type);
  }
}

// 注册默认工厂
UIFactoryRegistry.register('terminal', new TerminalPermissionUIFactory());
```

## 5. 实现步骤

### 5.1 第一阶段：创建工厂接口和实现

1. 创建 `src/ui/factories/PermissionUIFactory.ts`
   - 定义工厂接口
   - 添加JSDoc文档

2. 创建 `src/ui/factories/TerminalPermissionUIFactory.ts`
   - 实现终端UI工厂
   - 复用现有 PermissionUIImpl

3. 创建 `src/ui/factories/UIFactoryRegistry.ts`
   - 实现工厂注册表
   - 支持按类型注册和获取

### 5.2 第二阶段：重构 PermissionManager

4. 修改 `src/permissions/PermissionManager.ts`
   - 更新构造函数，接收工厂而非具体实现
   - 修改实例化逻辑

### 5.3 第三阶段：更新 main.ts

5. 修改 `src/main.ts`
   - 根据配置选择UI工厂
   - 通过注册表获取工厂实例
   - 传递给 PermissionManager

### 5.4 第四阶段：配置支持

6. 扩展配置系统
   - 在 PermissionConfig 中添加 ui 字段
   - 更新类型定义
   - 文档化配置选项

### 5.5 第五阶段：测试

7. 编写单元测试
   - 测试 TerminalPermissionUIFactory
   - 测试 UIFactoryRegistry
   - 测试 PermissionManager 工厂注入

8. 编写集成测试
   - 测试完整的UI工厂流程
   - 测试配置驱动的UI选择

## 6. 迁移计划

### 6.1 向后兼容性

- ✅ 保持现有 API 不变
- ✅ 现有配置继续有效（默认使用终端UI）
- ✅ 无破坏性更改

### 6.2 迁移路径

**当前**:
```typescript
const permissionUI = new PermissionUIImpl();
const permissionManager = new PermissionManager(config, permissionUI);
```

**迁移后**:
```typescript
// 自动根据配置选择
const factory = UIFactoryRegistry.create(config.ui);
const permissionManager = new PermissionManager(config, factory);
```

**等价替换**:
- main.ts 更改：3行代码
- PermissionManager 更改：2行代码
- 新增文件：3个工厂文件

### 6.3 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 工厂创建逻辑有bug | 低 | 中 | 充分的单元测试 |
| 配置格式不兼容 | 低 | 中 | 向后兼容，默认值 |
| 测试覆盖不足 | 中 | 高 | 完整的测试套件 |

## 7. 测试策略

### 7.1 单元测试

**TerminalPermissionUIFactory**:
```typescript
describe('TerminalPermissionUIFactory', () => {
  it('should create PermissionUI instance', () => {
    const factory = new TerminalPermissionUIFactory();
    const ui = factory.createPermissionUI();
    expect(ui).toBeInstanceOf(PermissionUIImpl);
  });

  it('should use custom streams when provided', () => {
    // 测试自定义输入输出流
  });
});
```

**UIFactoryRegistry**:
```typescript
describe('UIFactoryRegistry', () => {
  it('should register and get factory', () => {
    const factory = new TerminalPermissionUIFactory();
    UIFactoryRegistry.register('test', factory);
    const retrieved = UIFactoryRegistry.get('test');
    expect(retrieved).toBe(factory);
  });

  it('should throw error for unknown type', () => {
    expect(() => UIFactoryRegistry.get('unknown')).toThrow();
  });
});
```

**PermissionManager (重构后)**:
```typescript
describe('PermissionManager with factory', () => {
  it('should create PermissionUI from factory', () => {
    const mockFactory = {
      createPermissionUI: jest.fn().mockReturnValue(mockPermissionUI)
    };
    const manager = new PermissionManager(config, mockFactory);
    expect(mockFactory.createPermissionUI).toHaveBeenCalled();
  });
});
```

### 7.2 集成测试

**完整流程测试**:
```typescript
describe('PermissionUI integration', () => {
  it('should complete permission flow with factory-created UI', async () => {
    const config = { mode: 'default' };
    const factory = new TerminalPermissionUIFactory();
    const manager = new PermissionManager(config, factory);
    const canUseTool = manager.createCanUseToolHandler();

    const result = await canUseTool('Read', { file_path: '/test' }, options);
    expect(result).toBeDefined();
  });
});
```

### 7.3 验收标准

1. **功能正确性**: 工厂创建的UI与直接创建的UI行为一致
2. **向后兼容**: 现有功能无任何 regression
3. **扩展性**: 可通过注册新工厂添加新UI类型
4. **性能**: 工厂创建无明显性能开销
5. **可测试性**: 可轻松mock工厂进行测试

## 8. 未来扩展

### 8.1 Web UI支持

```typescript
export class WebPermissionUIFactory implements PermissionUIFactory {
  createPermissionUI(): PermissionUI {
    return new WebPermissionUI({
      websocket: /* ... */,
      eventEmitter: /* ... */
    });
  }
}

// 注册
UIFactoryRegistry.register('web', new WebPermissionUIFactory());
```

### 8.2 GUI支持

```typescript
export class GuiPermissionUIFactory implements PermissionUIFactory {
  createPermissionUI(): PermissionUI {
    return new GuiPermissionUI({
      window: /* ... */,
      dialog: /* ... */
    });
  }
}
```

### 8.3 混合UI支持

```typescript
export class HybridPermissionUIFactory implements PermissionUIFactory {
  createPermissionUI(): PermissionUI {
    // 根据环境自动选择UI类型
    if (process.env.DISPLAY) {
      return new GuiPermissionUI();
    } else {
      return new TerminalPermissionUIFactory().createPermissionUI();
    }
  }
}
```

## 9. 结论

### 9.1 优势总结

1. **架构改进**: 从直接依赖到抽象依赖，提高代码质量
2. **扩展性**: 支持未来添加新UI类型，无需修改核心代码
3. **可测试性**: 易于mock和替换，提高测试覆盖率
4. **可维护性**: 单一职责，UI创建逻辑独立
5. **向后兼容**: 无破坏性更改，平滑迁移

### 9.2 下一步行动

1. ✅ 完成设计文档
2. ⏳ 实现第一阶段（工厂接口和基础实现）
3. ⏳ 重构 PermissionManager
4. ⏳ 更新 main.ts
5. ⏳ 编写测试
6. ⏳ 验证和文档更新

### 9.3 成功指标

- [ ] 所有现有测试通过
- [ ] 新增测试覆盖工厂相关代码
- [ ] 可以通过配置选择不同UI类型
- [ ] 添加新UI类型无需修改核心逻辑
- [ ] 代码审查通过

## 10. 参考

- [工厂模式 - Refactoring.Guru](https://refactoring.guru/design-patterns/factory-method)
- [依赖倒置原则 - 维基百科](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
- 项目CLAUDE.md - 架构设计约束
- 当前实现 - src/main.ts, src/permissions/PermissionManager.ts
