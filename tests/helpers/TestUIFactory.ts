import type { PermissionUI, QuestionAnswers, QuestionInput } from '../../src/permissions/PermissionUI';
import type { PermissionUIResult, ToolPermissionRequest } from '../../src/permissions/types';
import type { OutputInterface, OutputOptions } from '../../src/ui/OutputInterface';
import type { OptionsInterface } from '../../src/ui/OptionsInterface';
import type { ParserInterface } from '../../src/ui/ParserInterface';
import type {
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIInterface,
} from '../../src/ui/InteractiveUIInterface';
import type { MessageRole, PermissionMode, Snapshot } from '../../src/ui/InteractiveUIInterface';
import type { Session, SessionStats } from '../../src/core/SessionManager';
import type { UIFactory } from '../../src/ui/factories/UIFactory';

export class TestParser implements ParserInterface {
  readonly parseCalls: string[][] = [];
  readonly getHelpTextCalls: Array<null> = [];
  readonly getVersionTextCalls: Array<null> = [];

  parse(args: string[]): OptionsInterface {
    this.parseCalls.push(args);
    return {
      help: false,
      version: false,
      debug: false,
    };
  }

  getHelpText(): string {
    this.getHelpTextCalls.push(null);
    return 'test help';
  }

  getVersionText(): string {
    this.getVersionTextCalls.push(null);
    return 'test version';
  }
}

export class TestOutput implements OutputInterface {
  readonly infoCalls: Array<[string, OutputOptions | undefined]> = [];
  readonly warnCalls: Array<[string, OutputOptions | undefined]> = [];
  readonly errorCalls: Array<[string, OutputOptions | undefined]> = [];
  readonly successCalls: Array<[string, OutputOptions | undefined]> = [];
  readonly sectionCalls: Array<[string, OutputOptions | undefined]> = [];
  readonly blankLineCalls: Array<number | undefined> = [];

  info(message: string, options?: OutputOptions): void {
    this.infoCalls.push([message, options]);
  }

  warn(message: string, options?: OutputOptions): void {
    this.warnCalls.push([message, options]);
  }

  error(message: string, options?: OutputOptions): void {
    this.errorCalls.push([message, options]);
  }

  success(message: string, options?: OutputOptions): void {
    this.successCalls.push([message, options]);
  }

  section(title: string, options?: OutputOptions): void {
    this.sectionCalls.push([title, options]);
  }

  blankLine(count?: number): void {
    this.blankLineCalls.push(count);
  }
}

export class TestPermissionUI implements PermissionUI {
  readonly promptToolPermissionCalls: ToolPermissionRequest[] = [];
  readonly promptUserQuestionsCalls: QuestionInput[][] = [];
  nextPermissionResult: PermissionUIResult = { approved: true };
  nextQuestionAnswers: QuestionAnswers = {};

  async promptToolPermission(request: ToolPermissionRequest): Promise<PermissionUIResult> {
    this.promptToolPermissionCalls.push(request);
    return this.nextPermissionResult;
  }

  async promptUserQuestions(questions: QuestionInput[]): Promise<QuestionAnswers> {
    this.promptUserQuestionsCalls.push(questions);
    return this.nextQuestionAnswers;
  }
}

export class TestInteractiveUI implements InteractiveUIInterface {
  readonly callbacks: InteractiveUICallbacks;
  readonly config?: InteractiveUIConfig;

  constructor(callbacks: InteractiveUICallbacks, config?: InteractiveUIConfig) {
    this.callbacks = callbacks;
    this.config = config;
  }

  async start(): Promise<void> {
    return;
  }

  stop(): void {
    return;
  }

  displayMessage(_message: string, _role: MessageRole): void {
    return;
  }

  displayToolUse(_tool: string, _args: Record<string, unknown>): void {
    return;
  }

  displayToolResult(_tool: string, _result: string, _isError?: boolean): void {
    return;
  }

  displayThinking(_content?: string): void {
    return;
  }

  displayComputing(): void {
    return;
  }

  stopComputing(): void {
    return;
  }

  clearProgress(): void {
    return;
  }

  displayError(_message: string): void {
    return;
  }

  displayWarning(_message: string): void {
    return;
  }

  displaySuccess(_message: string): void {
    return;
  }

  displayInfo(_message: string): void {
    return;
  }

  async promptConfirmation(_message: string): Promise<boolean> {
    return true;
  }

  async showRewindMenu(_snapshots: Snapshot[]): Promise<Snapshot | null> {
    return null;
  }

  async showSessionMenu(_sessions: Session[]): Promise<Session | null> {
    return null;
  }

  async showConfirmationMenu(
    _title: string,
    _options: Array<{ key: string; label: string; description?: string }>,
    _defaultKey?: string
  ): Promise<boolean> {
    return true;
  }

  setInitialPermissionMode(_mode: PermissionMode): void {
    return;
  }

  setPermissionMode(_mode: PermissionMode): void {
    return;
  }

  displayPermissionStatus(_mode: PermissionMode): void {
    return;
  }

  setProcessingState(_processing: boolean): void {
    return;
  }

  formatRelativeTime(_date: Date): string {
    return '';
  }

  formatAbsoluteTime(_date: Date): string {
    return '';
  }

  formatStatsSummary(_stats?: SessionStats): string {
    return '';
  }
}

export class TestUIFactory implements UIFactory {
  readonly parserInstances: TestParser[] = [];
  readonly outputInstances: TestOutput[] = [];
  readonly permissionUIInstances: TestPermissionUI[] = [];
  readonly interactiveUIInstances: TestInteractiveUI[] = [];

  createParser(): TestParser {
    const parser = new TestParser();
    this.parserInstances.push(parser);
    return parser;
  }

  createOutput(): TestOutput {
    const output = new TestOutput();
    this.outputInstances.push(output);
    return output;
  }

  createPermissionUI(
    _output?: NodeJS.WritableStream,
    _input?: NodeJS.ReadableStream
  ): TestPermissionUI {
    const permissionUI = new TestPermissionUI();
    this.permissionUIInstances.push(permissionUI);
    return permissionUI;
  }

  createInteractiveUI(
    callbacks: InteractiveUICallbacks,
    config?: InteractiveUIConfig
  ): TestInteractiveUI {
    const interactiveUI = new TestInteractiveUI(callbacks, config);
    this.interactiveUIInstances.push(interactiveUI);
    return interactiveUI;
  }
}
