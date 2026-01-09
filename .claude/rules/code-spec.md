## 日志
- 统一使用英文

## 异常
- 统一使用英文

## 魔法值
禁止硬编码数值，所有配置参数必须定义为具名常量并支持环境变量配置：`const PARAM = parseInt(process.env.ENV_VAR || 'default', 10);`