/**
 * File: Permission types and interfaces
 *
 * Core Types:
 * - PermissionResult: SDK canUseTool callback return type
 * - SDKCanUseTool: SDK-compatible canUseTool callback signature
 * - ToolPermissionRequest: Permission request information for UI layer
 * - PermissionUIResult: UI layer permission prompt result
 */

/**
 * SDK canUseTool callback return type (matches SDK specification)
 */
export type PermissionResult =
  | {
      /** Permission decision: allow */
      behavior: 'allow';
      /** Updated tool input (required for allow) */
      updatedInput: Record<string, unknown>;
      /** Tool use ID (passed back from options) */
      toolUseID?: string;
    }
  | {
      /** Permission decision: deny */
      behavior: 'deny';
      /** Denial reason message (required for deny) */
      message: string;
      /** Whether to interrupt the session */
      interrupt?: boolean;
      /** Tool use ID (passed back from options) */
      toolUseID?: string;
    };

/**
 * SDK-compatible canUseTool callback signature
 */
export type SDKCanUseTool = (
  toolName: string,
  input: unknown,
  options: {
    signal: AbortSignal;
    toolUseID: string;
  }
) => Promise<PermissionResult>;

/**
 * Tool permission request information for UI layer
 */
export interface ToolPermissionRequest {
  /** Tool name */
  toolName: string;
  /** Tool use ID */
  toolUseID: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
  /** Request timestamp */
  timestamp: Date;
}

/**
 * UI layer permission prompt result
 */
export interface PermissionUIResult {
  /** Whether user approved the request */
  approved: boolean;
  /** Optional denial reason */
  reason?: string;
}
