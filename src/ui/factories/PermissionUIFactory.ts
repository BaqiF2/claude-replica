/**
 * File: Permission UI Factory Interface
 *
 * Core Interface:
 * - PermissionUIFactory: Factory interface for creating PermissionUI instances
 *
 * Responsibilities:
 * - Define contract for creating PermissionUI instances
 * - Support multiple UI types (terminal, web, gui, etc.)
 * - Enable dependency inversion for UI layer
 */

import { PermissionUI } from '../../permissions/PermissionUI';

/**
 * PermissionUI Factory Interface
 *
 * Defines the contract for creating PermissionUI instances.
 * Implementations should handle the creation of appropriate UI components
 * based on the runtime environment and configuration.
 */
export interface PermissionUIFactory {
  /**
   * Create a PermissionUI instance
   *
   * @param output Output stream (optional, defaults to process.stdout)
   * @param input Input stream (optional, defaults to process.stdin)
   * @returns PermissionUI instance
   */
  createPermissionUI(output?: NodeJS.WritableStream, input?: NodeJS.ReadableStream): PermissionUI;
}
