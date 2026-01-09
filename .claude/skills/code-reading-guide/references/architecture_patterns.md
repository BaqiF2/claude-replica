# 常见架构模式识别指南

## 分层架构 (Layered Architecture)

### 识别特征
```
典型目录结构:
src/
├── controller/     # 接口层
├── service/        # 业务逻辑层
├── repository/     # 数据访问层
├── model/entity/   # 数据模型
└── config/         # 配置
```

### 阅读顺序
1. **Controller层**: 理解对外API
2. **Service层**: 掌握业务逻辑
3. **Repository层**: 了解数据操作
4. **Model层**: 理解数据结构

### 关键文件模式
- `*Controller.java` / `*Handler.java`
- `*Service.java` / `*ServiceImpl.java`
- `*Repository.java` / `*Dao.java` / `*Mapper.java`

---

## 领域驱动设计 (DDD)

### 识别特征
```
src/
├── domain/          # 领域层
│   ├── model/       # 领域模型
│   ├── service/     # 领域服务
│   └── repository/  # 仓储接口
├── application/     # 应用层
│   └── service/     # 应用服务
├── infrastructure/  # 基础设施层
│   ├── repository/  # 仓储实现
│   └── config/
└── interfaces/      # 接口层
    └── api/
```

### 阅读顺序
1. **Domain/Model**: 理解核心业务概念(聚合根、实体、值对象)
2. **Application/Service**: 理解用例编排
3. **Interface/API**: 理解对外接口
4. **Infrastructure**: 理解技术实现

### 关键概念
- **聚合根** (Aggregate Root): 业务一致性边界
- **值对象** (Value Object): 无唯一标识的对象
- **领域事件** (Domain Event): 业务状态变化
- **仓储** (Repository): 聚合持久化抽象

---

## 微服务架构 (Microservices)

### 识别特征
```
project/
├── user-service/
│   ├── src/
│   └── pom.xml
├── order-service/
│   ├── src/
│   └── pom.xml
├── payment-service/
└── common/          # 公共组件
```

### 阅读顺序
1. **Gateway/API网关**: 理解服务路由
2. **核心业务服务**: 从主要业务流开始
3. **支撑服务**: 配置中心、服务注册
4. **Common模块**: 公共依赖

### 关键技术点
- 服务间通信: REST/gRPC/消息队列
- 服务发现: Eureka/Consul/Nacos
- 配置管理: Config Server
- 熔断限流: Hystrix/Sentinel

---

## 六边形架构 (Hexagonal/Ports & Adapters)

### 识别特征
```
src/
├── domain/          # 核心业务逻辑
├── ports/           # 端口(接口定义)
│   ├── inbound/     # 入站端口
│   └── outbound/    # 出站端口
└── adapters/        # 适配器(接口实现)
    ├── web/         # Web适配器
    ├── persistence/ # 持久化适配器
    └── messaging/   # 消息适配器
```

### 阅读顺序
1. **Domain**: 核心业务逻辑(与技术无关)
2. **Ports/Inbound**: 应用提供的能力
3. **Ports/Outbound**: 应用依赖的能力
4. **Adapters**: 技术实现细节

---

## MVC架构 (Model-View-Controller)

### 识别特征
```
app/
├── models/          # 数据模型
├── views/           # 视图模板
├── controllers/     # 控制器
└── routes/          # 路由定义
```

### 阅读顺序
1. **Routes**: 理解URL映射
2. **Controllers**: 理解请求处理
3. **Models**: 理解数据结构
4. **Views**: 理解页面渲染

### 典型框架
- Ruby on Rails
- Django (MVT变体)
- Laravel
- Express.js (轻量级)

---

## 事件驱动架构 (Event-Driven)

### 识别特征
```
src/
├── events/          # 事件定义
├── handlers/        # 事件处理器
├── publishers/      # 事件发布
└── subscribers/     # 事件订阅
```

### 阅读顺序
1. **Events定义**: 理解系统事件类型
2. **Publishers**: 理解事件产生场景
3. **Handlers/Subscribers**: 理解事件处理逻辑
4. **消息基础设施**: Kafka/RabbitMQ配置

### 关键模式
- Event Sourcing: 事件溯源
- CQRS: 读写分离
- Saga: 分布式事务

---

## CQRS (命令查询职责分离)

### 识别特征
```
src/
├── commands/        # 写操作
│   ├── handlers/
│   └── models/
├── queries/         # 读操作
│   ├── handlers/
│   └── models/
└── events/          # 事件
```

### 阅读顺序
1. **Commands**: 理解写操作(状态变更)
2. **Queries**: 理解读操作(数据查询)
3. **Events**: 理解状态同步机制

---

## 混合架构识别

实际项目常常混合多种模式:

### Spring Boot常见组合
```
分层架构 + DDD战术设计
Controller → Application Service → Domain Service → Repository
```

### 大型系统常见组合
```
微服务 + DDD + Event-Driven
每个微服务内部使用DDD,服务间通过事件通信
```

## 识别流程

1. **看目录结构**: 识别顶层组织方式
2. **看配置文件**: 识别技术栈
3. **看命名约定**: 识别设计模式
4. **看依赖关系**: 识别架构边界