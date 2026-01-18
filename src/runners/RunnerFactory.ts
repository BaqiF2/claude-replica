/**
 * 文件功能：运行器工厂类，根据应用选项创建相应的运行器实例。
 *
 * 核心类：
 * - RunnerFactory: 根据选项创建 NonInteractiveRunner 或 InteractiveRunner。
 *
 * 核心方法：
 * - createRunner(): 根据 options.print 选择并创建合适的运行器。
 */

import type { ApplicationRunner, ApplicationOptions } from './ApplicationRunner';
import { NonInteractiveRunner } from './NonInteractiveRunner';
import { InteractiveRunner } from './InteractiveRunner';
import type { OutputInterface } from '../ui/OutputInterface';
import type { SessionManager } from '../core/SessionManager';
import type { MessageRouter } from '../core/MessageRouter';
import type { SDKQueryExecutor } from '../sdk';
import type { OutputFormatter } from '../output/OutputFormatter';
import type { PermissionManager } from '../permissions/PermissionManager';
import type { MCPService } from '../mcp/MCPService';
import type { CheckpointManager } from '../checkpoint/CheckpointManager';
import type { ConfigManager } from '../config';
import type { Logger } from '../logging/Logger';
import type { UIFactory } from '../ui/factories/UIFactory';

export class RunnerFactory {
  constructor(
    private readonly output: OutputInterface,
    private readonly sessionManager: SessionManager,
    private readonly messageRouter: MessageRouter,
    private readonly sdkExecutor: SDKQueryExecutor,
    private readonly outputFormatter: OutputFormatter,
    private readonly permissionManager: PermissionManager,
    private readonly mcpService: MCPService,
    private readonly checkpointManager: CheckpointManager | null,
    private readonly configManager: ConfigManager,
    private readonly uiFactory: UIFactory,
    private readonly logger: Logger
  ) {}

  createRunner(options: ApplicationOptions): ApplicationRunner {
    if (options.print) {
      return new NonInteractiveRunner(
        this.output,
        this.sessionManager,
        this.messageRouter,
        this.sdkExecutor,
        this.outputFormatter,
        this.configManager,
        this.logger
      );
    }

    return new InteractiveRunner(
      this.output,
      this.sessionManager,
      this.messageRouter,
      this.sdkExecutor,
      this.permissionManager,
      this.mcpService,
      this.checkpointManager,
      this.configManager,
      this.uiFactory,
      this.logger
    );
  }
}
