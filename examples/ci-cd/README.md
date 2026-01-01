# CI/CD 集成示例

本示例展示如何在 CI/CD 管道中使用 Claude Replica。

## 目录结构

```
ci-cd/
├── README.md
├── .github/
│   └── workflows/
│       ├── code-review.yml
│       └── test-generation.yml
├── .gitlab-ci.yml
├── Jenkinsfile
└── scripts/
    ├── review.sh
    └── generate-tests.sh
```

## GitHub Actions

### 代码审查工作流

`.github/workflows/code-review.yml`:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install Claude Replica
        run: npm install -g claude-replica

      - name: Get changed files
        id: changed-files
        run: |
          echo "files=$(git diff --name-only origin/${{ github.base_ref }}...HEAD | tr '\n' ' ')" >> $GITHUB_OUTPUT

      - name: Run AI Code Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude-replica -p "请审查以下文件的代码变更: ${{ steps.changed-files.outputs.files }}" \
            --output-format markdown \
            --timeout 300 \
            > review.md

      - name: Post Review Comment
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('review.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: review
            });
```

### 测试生成工作流

`.github/workflows/test-generation.yml`:

```yaml
name: AI Test Generation

on:
  workflow_dispatch:
    inputs:
      file:
        description: 'File to generate tests for'
        required: true

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install Claude Replica
        run: npm install -g claude-replica

      - name: Generate Tests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude-replica -p "请为 ${{ github.event.inputs.file }} 生成单元测试" \
            --output-format text \
            --timeout 600

      - name: Create PR
        uses: peter-evans/create-pull-request@v5
        with:
          title: 'test: add AI-generated tests'
          body: 'This PR adds AI-generated tests.'
          branch: ai-tests
```

## GitLab CI

`.gitlab-ci.yml`:

```yaml
stages:
  - review
  - test

variables:
  NODE_VERSION: "20"

ai-code-review:
  stage: review
  image: node:${NODE_VERSION}
  only:
    - merge_requests
  script:
    - npm install -g claude-replica
    - |
      claude-replica -p "请审查此 MR 的代码变更" \
        --output-format json \
        --timeout 300 \
        > review.json
  artifacts:
    paths:
      - review.json
    expire_in: 1 week

ai-test-generation:
  stage: test
  image: node:${NODE_VERSION}
  when: manual
  script:
    - npm install -g claude-replica
    - |
      claude-replica -p "请为项目生成缺失的测试" \
        --output-format text \
        --timeout 600
```

## Jenkins

`Jenkinsfile`:

```groovy
pipeline {
    agent {
        docker {
            image 'node:20'
        }
    }

    environment {
        ANTHROPIC_API_KEY = credentials('anthropic-api-key')
    }

    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g claude-replica'
            }
        }

        stage('AI Code Review') {
            when {
                changeRequest()
            }
            steps {
                script {
                    def review = sh(
                        script: '''
                            claude-replica -p "请审查代码变更" \
                                --output-format markdown \
                                --timeout 300
                        ''',
                        returnStdout: true
                    )
                    
                    // 发布审查结果
                    publishHTML([
                        reportName: 'AI Code Review',
                        reportDir: '.',
                        reportFiles: 'review.html'
                    ])
                }
            }
        }

        stage('AI Test Generation') {
            when {
                branch 'main'
            }
            steps {
                sh '''
                    claude-replica -p "请检查测试覆盖率并生成缺失的测试" \
                        --output-format text \
                        --timeout 600
                '''
            }
        }
    }

    post {
        failure {
            echo 'Pipeline failed!'
        }
    }
}
```

## 脚本示例

### review.sh

```bash
#!/bin/bash

# AI 代码审查脚本

set -e

# 检查 API 密钥
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "错误: 未设置 ANTHROPIC_API_KEY"
    exit 1
fi

# 获取变更文件
CHANGED_FILES=$(git diff --name-only HEAD~1)

if [ -z "$CHANGED_FILES" ]; then
    echo "没有变更的文件"
    exit 0
fi

echo "审查以下文件:"
echo "$CHANGED_FILES"

# 运行审查
claude-replica -p "请审查以下文件的代码变更: $CHANGED_FILES" \
    --output-format markdown \
    --timeout 300

exit $?
```

### generate-tests.sh

```bash
#!/bin/bash

# AI 测试生成脚本

set -e

FILE=$1

if [ -z "$FILE" ]; then
    echo "用法: $0 <file>"
    exit 1
fi

if [ ! -f "$FILE" ]; then
    echo "错误: 文件不存在: $FILE"
    exit 1
fi

echo "为 $FILE 生成测试..."

claude-replica -p "请为 $FILE 生成完整的单元测试，包括边界情况和错误处理" \
    --output-format text \
    --timeout 600

exit $?
```

## 最佳实践

### 1. 设置超时

始终设置合理的超时时间，避免 CI 任务挂起：

```bash
claude-replica -p "..." --timeout 300
```

### 2. 使用结构化输出

在 CI 中使用 JSON 输出便于解析：

```bash
claude-replica -p "..." --output-format json > result.json
```

### 3. 处理退出码

检查退出码以确定任务是否成功：

```bash
if claude-replica -p "..."; then
    echo "成功"
else
    echo "失败"
    exit 1
fi
```

### 4. 保护 API 密钥

- 使用 CI 平台的密钥管理功能
- 不要在日志中打印密钥
- 定期轮换密钥

### 5. 限制并发

避免同时运行太多 AI 任务：

```yaml
# GitHub Actions
concurrency:
  group: ai-review-${{ github.ref }}
  cancel-in-progress: true
```

## 退出码

| 退出码 | 描述 |
|--------|------|
| 0 | 成功 |
| 1 | 一般错误 |
| 2 | 配置错误 |
| 3 | 认证错误 |
| 4 | 网络错误 |
| 5 | 超时错误 |
| 6 | 权限错误 |

## 故障排除

### API 密钥问题

```
错误: API 错误: 认证失败
```

- 检查密钥是否正确设置
- 确认密钥有效且未过期

### 超时问题

```
错误: 执行超时
```

- 增加超时时间
- 简化查询
- 分解复杂任务

### 网络问题

```
错误: 网络错误
```

- 检查网络连接
- 检查代理设置
- 重试任务
