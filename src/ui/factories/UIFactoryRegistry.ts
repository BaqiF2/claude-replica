/**
 * File: UI Factory Registry
 *
 * Core Class:
 * - UIFactoryRegistry: Registry for managing UI factory registration and retrieval
 *
 * Responsibilities:
 * - Register UI factories by type
 * - Retrieve factories by type
 * - Create factories from configuration
 * - Provide default factory selection
 */

import { PermissionUIFactory } from './PermissionUIFactory';
import { TerminalPermissionUIFactory } from './TerminalPermissionUIFactory';

/**
 * UI Configuration Interface
 *
 * Defines configuration for selecting and configuring UI factories.
 */
export interface UIConfig {
  /** UI type (e.g., 'terminal', 'web', 'gui') */
  type: string;
  /** UI options (optional, factory-specific) */
  options?: Record<string, unknown>;
}

/**
 * UI Factory Registry
 *
 * Manages registration and retrieval of PermissionUIFactory instances.
 * Supports multiple UI types and provides factory creation based on configuration.
 */
export class UIFactoryRegistry {
  /** Internal registry of factories by type */
  private static factories: Map<string, PermissionUIFactory> = new Map();

  /**
   * Register a UI factory for a specific type
   *
   * @param type UI type identifier (e.g., 'terminal', 'web')
   * @param factory Factory instance to register
   */
  static register(type: string, factory: PermissionUIFactory): void {
    if (!type || typeof type !== 'string') {
      throw new Error('UI factory type must be a non-empty string');
    }

    if (!factory) {
      throw new Error('UI factory instance is required');
    }

    this.factories.set(type, factory);
  }

  /**
   * Retrieve a registered UI factory by type
   *
   * @param type UI type identifier
   * @returns Registered factory instance
   * @throws Error if factory type is not registered
   */
  static get(type: string): PermissionUIFactory {
    if (!type || typeof type !== 'string') {
      throw new Error('UI factory type must be a non-empty string');
    }

    const factory = this.factories.get(type);

    if (!factory) {
      throw new Error(`UI factory not found for type: ${type}`);
    }

    return factory;
  }

  /**
   * Create a UI factory based on configuration
   *
   * @param config UI configuration (optional)
   * @returns Factory instance (defaults to TerminalPermissionUIFactory if config is null/undefined)
   */
  static create(config?: UIConfig): PermissionUIFactory {
    // If no config provided, return default terminal factory
    if (!config) {
      return new TerminalPermissionUIFactory();
    }

    // Validate config type
    if (!config.type || typeof config.type !== 'string') {
      throw new Error('UI config must include a valid type string');
    }

    // Get and return the registered factory for this type
    return this.get(config.type);
  }

  /**
   * Check if a factory type is registered
   *
   * @param type UI type identifier
   * @returns true if factory is registered, false otherwise
   */
  static has(type: string): boolean {
    return this.factories.has(type);
  }

  /**
   * Get list of all registered factory types
   *
   * @returns Array of registered type names
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Clear all registered factories (primarily for testing)
   */
  static clear(): void {
    this.factories.clear();
  }
}

// Register default terminal factory on module load
UIFactoryRegistry.register('terminal', new TerminalPermissionUIFactory());
