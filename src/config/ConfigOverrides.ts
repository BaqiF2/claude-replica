import type { PermissionMode } from '../permissions/PermissionManager';

export interface ConfigOverrides {
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: PermissionMode;
  maxTurns?: number;
  maxBudgetUsd?: number;
  maxThinkingTokens?: number;
  sandbox?: boolean;
  allowDangerouslySkipPermissions?: boolean;
}
