/**
 * 示例代码文件
 * 
 * 展示 TypeScript 基本用法
 */

// 用户接口定义
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// 结果类型
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * 用户仓库类
 * 
 * 管理用户数据的存储和检索
 */
class UserRepository {
  private users: Map<string, User> = new Map();

  /**
   * 创建新用户
   * 
   * @param name - 用户名
   * @param email - 邮箱地址
   * @returns 创建结果
   */
  create(name: string, email: string): Result<User> {
    // 验证输入
    if (!name || name.trim().length === 0) {
      return {
        success: false,
        error: new Error('用户名不能为空'),
      };
    }

    if (!this.isValidEmail(email)) {
      return {
        success: false,
        error: new Error('邮箱格式无效'),
      };
    }

    // 创建用户
    const user: User = {
      id: this.generateId(),
      name: name.trim(),
      email: email.toLowerCase(),
      createdAt: new Date(),
    };

    this.users.set(user.id, user);

    return {
      success: true,
      data: user,
    };
  }

  /**
   * 根据 ID 获取用户
   * 
   * @param id - 用户 ID
   * @returns 用户或 undefined
   */
  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * 获取所有用户
   * 
   * @returns 用户数组
   */
  findAll(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * 更新用户
   * 
   * @param id - 用户 ID
   * @param updates - 更新字段
   * @returns 更新结果
   */
  update(id: string, updates: Partial<Pick<User, 'name' | 'email'>>): Result<User> {
    const user = this.users.get(id);

    if (!user) {
      return {
        success: false,
        error: new Error('用户不存在'),
      };
    }

    // 验证更新
    if (updates.email && !this.isValidEmail(updates.email)) {
      return {
        success: false,
        error: new Error('邮箱格式无效'),
      };
    }

    // 应用更新
    const updatedUser: User = {
      ...user,
      ...updates,
      email: updates.email?.toLowerCase() ?? user.email,
    };

    this.users.set(id, updatedUser);

    return {
      success: true,
      data: updatedUser,
    };
  }

  /**
   * 删除用户
   * 
   * @param id - 用户 ID
   * @returns 是否删除成功
   */
  delete(id: string): boolean {
    return this.users.delete(id);
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 验证邮箱格式
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// 使用示例
function main(): void {
  const repo = new UserRepository();

  // 创建用户
  const result = repo.create('张三', 'zhangsan@example.com');

  if (result.success) {
    console.log('用户创建成功:', result.data);

    // 更新用户
    const updateResult = repo.update(result.data.id, {
      name: '张三（已更新）',
    });

    if (updateResult.success) {
      console.log('用户更新成功:', updateResult.data);
    }
  } else {
    console.error('用户创建失败:', result.error.message);
  }

  // 列出所有用户
  console.log('所有用户:', repo.findAll());
}

// 导出
export { User, Result, UserRepository };

// 运行示例
if (require.main === module) {
  main();
}
