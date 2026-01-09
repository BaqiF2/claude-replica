---
name: code-reading-guide
description: 为新入职员工或代码审查者生成结构化的代码阅读路径指南。自动分析项目架构,识别技术栈和分层结构,按照从上层到底层的顺序生成渐进式阅读计划。适用场景:(1)新员工项目onboarding,(2)代码审查准备,(3)系统重构前分析,(4)技术债务评估。支持Java/Spring、Node.js、Python等常见技术栈。
---

# Code Reading Guide Generator

## Overview

自动分析项目结构,生成从架构层到实现层的渐进式代码阅读路径,帮助新人快速掌握项目核心脉络。

## 核心工作流

### 第一步:项目扫描与分析

1. **识别项目类型和技术栈**
   ```bash
   # 扫描项目根目录
   ls -la
   
   # 检查构建配置文件
   # Java: pom.xml, build.gradle
   # Node.js: package.json
   # Python: requirements.txt, pyproject.toml
   # Go: go.mod
   ```

2. **分析目录结构**
   ```bash
   # 生成目录树(深度2-3层)
   tree -L 3 -I 'node_modules|target|build|dist|.git'
   ```

3. **识别架构模式**
    - 分层架构: controller/service/repository
    - 微服务: 多个独立模块
    - DDD: domain/application/infrastructure
    - 六边形架构: ports/adapters

### 第二步:构建阅读路径

**按照以下优先级顺序组织:**

#### 1. 配置与入口层 (Configuration & Entry)
- **目标**: 理解项目如何启动和配置
- **重点文件**:
    - Java Spring: `Application.java`, `application.yml`
    - Node.js: `index.js`, `app.js`, `package.json`
    - Python: `__main__.py`, `settings.py`
- **阅读要点**: 依赖注入、中间件配置、全局拦截器

#### 2. 接口定义层 (API/Interface Layer)
- **目标**: 了解系统对外提供的功能
- **重点文件**:
    - RESTful: `*Controller.java`, `routes/*.js`
    - GraphQL: `schema.graphql`, resolvers
    - gRPC: `*.proto`
- **阅读要点**: 端点定义、参数校验、权限控制

#### 3. 业务逻辑层 (Business Logic Layer)
- **目标**: 掌握核心业务流程
- **重点文件**:
    - `*Service.java`, `*Manager.java`
    - `services/*.js`, `handlers/*.go`
- **阅读要点**: 业务规则、状态转换、事务边界

#### 4. 领域模型层 (Domain Model Layer)
- **目标**: 理解业务实体和关系
- **重点文件**:
    - `*Entity.java`, `*Model.java`
    - `models/*.js`, `domain/*.py`
- **阅读要点**: 实体关系、值对象、聚合根

#### 5. 数据访问层 (Data Access Layer)
- **目标**: 了解数据持久化机制
- **重点文件**:
    - `*Repository.java`, `*Mapper.java`
    - `dao/*.js`, `repositories/*.py`
- **阅读要点**: ORM映射、查询优化、缓存策略

#### 6. 基础设施层 (Infrastructure Layer)
- **目标**: 理解底层支撑组件
- **重点文件**:
    - `*Config.java`, `*Filter.java`
    - `utils/*.js`, `middleware/*.js`
    - `exception/*.java`
- **阅读要点**: 异常处理、日志记录、工具类

### 第三步:生成阅读指南文档

创建结构化的Markdown文档,包含:

1. **项目概览**
    - 技术栈总结
    - 架构图(如有)
    - 模块依赖关系

2. **分层阅读路径**
    - 每层的文件清单
    - 推荐阅读顺序
    - 关键类/函数说明

3. **业务流程追踪**
    - 典型用户场景
    - 代码调用链路
    - 数据流转路径

4. **注意事项**
    - 设计模式应用
    - 性能优化点
    - 潜在风险点

## 技术栈特定指南

### Java Spring Boot 项目

```markdown
阅读顺序:
1. Application.java (启动类)
2. application.yml/properties (配置)
3. *Controller (API接口)
4. *Service/*ServiceImpl (业务逻辑)
5. *Entity/*DTO (数据模型)
6. *Repository/*Mapper (数据访问)
7. config/* (配置类)
8. exception/* (异常处理)
```

关键注解理解:
- `@SpringBootApplication`: 启动配置
- `@RestController`: REST接口
- `@Service`: 业务服务
- `@Repository`: 数据访问
- `@Transactional`: 事务管理

### Node.js Express 项目

```markdown
阅读顺序:
1. package.json (依赖管理)
2. app.js/index.js (应用入口)
3. routes/* (路由定义)
4. controllers/* (请求处理)
5. services/* (业务逻辑)
6. models/* (数据模型)
7. middlewares/* (中间件)
8. utils/* (工具函数)
```

### Python Django/FastAPI 项目

```markdown
阅读顺序:
1. settings.py/config.py (配置)
2. urls.py/router.py (路由)
3. views.py/endpoints.py (视图/端点)
4. models.py (数据模型)
5. serializers.py/schemas.py (序列化)
6. services.py (业务逻辑)
7. middleware.py (中间件)
```

## 输出模板

使用 `references/reading_guide_template.md` 作为输出模板,包含:

- 项目基本信息卡片
- 技术栈雷达图(文字描述)
- 分层阅读清单
- 核心业务流程图
- 常见问题FAQ

## 高级功能

### 依赖分析

使用工具分析模块依赖:
```bash
# Java
mvn dependency:tree

# Node.js  
npm ls --depth=2

# Python
pip show <package>
```

### 代码复杂度评估

标注高复杂度模块:
- 圈复杂度 > 10: 需重点理解
- 代码行数 > 500: 建议拆分阅读
- 嵌套层级 > 4: 注意逻辑流程

### 变更频率分析

```bash
# Git提交历史分析
git log --pretty=format: --name-only | sort | uniq -c | sort -rg | head -20
```

高频变更文件往往是业务核心。

## 使用示例

**用户请求**: "帮我生成这个Spring Boot项目的代码阅读指南"

**执行步骤**:
1. 扫描项目识别Spring Boot技术栈
2. 分析`src/main/java`目录结构
3. 识别`controller`、`service`、`repository`分层
4. 提取关键业务模块(如订单、用户、支付)
5. 生成分层阅读路径
6. 输出Markdown格式的阅读指南