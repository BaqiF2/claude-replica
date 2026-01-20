/**
 * File: UI Factory Registry
 *
 * Core Class:
 * - UIFactoryRegistry: Registry for managing UI factory registration and retrieval
 * - Extension: Supports both PermissionUIFactory and UIFactory registration
 *
 * Responsibilities:
 * - Register permission UI factories by type
 * - Retrieve permission UI factories by type
 * - Create permission UI factories from configuration
 * - Register UIFactory instances by type
 * - Create UIFactory instances from configuration
 */

import { PermissionUIFactory } from './PermissionUIFactory';
import { TerminalPermissionUIFactory } from './TerminalPermissionUIFactory';
import { TerminalUIFactory } from './TerminalUIFactory';
import type { UIFactory } from '../contracts/core/UIFactory';

const DEFAULT_UI_FACTORY_TYPE = process.env.CLAUDE_UI_TYPE || 'terminal';

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
  /** Internal registry of UIFactory instances by type */
  private static uiFactories: Map<string, UIFactory> = new Map();
  /** Cached UIFactory singleton instance */
  private static uiFactoryInstance: UIFactory | null = null;

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
   * Register a UIFactory for a specific type
   *
   * @param type UI type identifier (e.g., 'terminal', 'web')
   * @param factory UIFactory instance to register
   */
  static registerUIFactory(type: string, factory: UIFactory): void {
    if (!type || typeof type !== 'string') {
      throw new Error('UI factory type must be a non-empty string');
    }

    if (!factory) {
      throw new Error('UI factory instance is required');
    }

    this.uiFactories.set(type, factory);
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
    if (!config) {
      return new TerminalPermissionUIFactory();
    }

    if (!config.type) {
      throw new Error('UI config must include a valid type string');
    }
    return this.get(config.type);
  }

  /**
   * Create a UIFactory based on configuration
   *
   * @param config UI configuration (optional)
   * @returns UIFactory instance
   */
  static createUIFactory(config?: UIConfig): UIFactory {
    if (this.uiFactoryInstance) {
      return this.uiFactoryInstance;
    }

    if (config && !config.type) {
      throw new Error('UI config must include a valid type string');
    }

    const resolvedType = config?.type ?? DEFAULT_UI_FACTORY_TYPE;
    this.uiFactoryInstance = this.createUIFactoryInstance(resolvedType, {
      validateEnv: config == null,
    });
    return this.uiFactoryInstance;
  }

  static resetForTesting(): void {
    this.uiFactoryInstance = null;
  }

  private static createUIFactoryInstance(
    type: string,
    options?: { validateEnv?: boolean }
  ): UIFactory {
    if (options?.validateEnv) {
      const supportedTypes = this.getSupportedUIFactoryTypes();
      if (!supportedTypes.includes(type)) {
        throw new Error(
          `Invalid CLAUDE_UI_TYPE: "${type}". Supported types: ${supportedTypes.join(', ')}`
        );
      }
    }

    if (this.uiFactories.has(type)) {
      return this.getUIFactory(type);
    }

    if (type === 'terminal') {
      return new TerminalUIFactory();
    }

    return this.getUIFactory(type);
  }

  private static getSupportedUIFactoryTypes(): string[] {
    const supportedTypes = new Set<string>(this.uiFactories.keys());
    supportedTypes.add('terminal');
    return Array.from(supportedTypes).sort();
  }

  private static getUIFactory(type: string): UIFactory {
    if (!type || typeof type !== 'string') {
      throw new Error('UI factory type must be a non-empty string');
    }

    const factory = this.uiFactories.get(type);

    if (!factory) {
      throw new Error(`UI factory not found for type: ${type}`);
    }

    return factory;
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
    this.uiFactories.clear();
    this.resetForTesting();
  }
}

// Register default terminal factory on module load
UIFactoryRegistry.register('terminal', new TerminalPermissionUIFactory());
