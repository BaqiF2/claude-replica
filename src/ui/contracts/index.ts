/**
 * File: UI Contracts Index
 *
 * Purpose:
 * - Unified export point for all UI contract interfaces
 * - Simplifies imports for custom UI implementations
 *
 * Usage:
 * ```typescript
 * import {
 *   UIFactory,
 *   ParserInterface,
 *   OutputInterface,
 *   InteractiveUIInterface
 * } from 'claude-replica/ui/contracts';
 * ```
 */

// Core contracts
export * from './core/UIFactory';
export * from './core/ParserInterface';
export * from './core/OutputInterface';
export * from './core/OptionsInterface';

// Interactive UI contracts
export * from './interactive/InteractiveUIInterface';

// Permission UI (re-export from permissions module for convenience)
export type { PermissionUI, QuestionInput, QuestionAnswers } from '../../permissions/PermissionUI';
