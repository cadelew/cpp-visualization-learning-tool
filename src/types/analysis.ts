/**
 * Types for the C++ analysis engine.
 */

import { SourceLocation } from './graph';

// ─── Parsed C++ Symbols ───────────────────────────────────────

export type SymbolKind =
  | 'file'
  | 'namespace'
  | 'class'
  | 'struct'
  | 'union'
  | 'enum'
  | 'function'
  | 'method'
  | 'constructor'
  | 'destructor'
  | 'variable'
  | 'field'
  | 'typedef'
  | 'macro'
  | 'template';

export type AccessSpecifier = 'public' | 'protected' | 'private';

export interface CppSymbol {
  id: string;
  kind: SymbolKind;
  name: string;
  qualifiedName: string;
  location: SourceLocation;
  /** Parent symbol ID (e.g., class for a method) */
  parentId?: string;
  /** Access specifier for class members */
  access?: AccessSpecifier;
  /** Template parameters if any */
  templateParams?: string[];
  /** Return type for functions/methods */
  returnType?: string;
  /** Parameter types for functions/methods */
  paramTypes?: string[];
  /** Whether this is virtual */
  isVirtual?: boolean;
  /** Whether this is static */
  isStatic?: boolean;
  /** Whether this is const */
  isConst?: boolean;
}

// ─── Relationships ────────────────────────────────────────────

export type RelationshipKind =
  | 'includes'
  | 'inherits'
  | 'implements'
  | 'calls'
  | 'uses_type'
  | 'has_member'
  | 'instantiates_template'
  | 'overrides'
  | 'friend_of';

export interface CppRelationship {
  kind: RelationshipKind;
  sourceId: string;
  targetId: string;
  location?: SourceLocation;
}

// ─── File Info ────────────────────────────────────────────────

export interface CppFileInfo {
  path: string;
  /** Relative path from workspace root */
  relativePath: string;
  isHeader: boolean;
  /** Lines of code (excluding blank/comments) */
  loc: number;
  /** Includes found */
  includes: IncludeDirective[];
  /** Top-level symbols */
  symbols: CppSymbol[];
}

export interface IncludeDirective {
  path: string;
  isSystem: boolean;
  location: SourceLocation;
  /** Resolved absolute path if found */
  resolvedPath?: string;
}

// ─── Analysis Config ──────────────────────────────────────────

export interface AnalysisConfig {
  workspaceRoot: string;
  compileCommandsPath?: string;
  excludePatterns: string[];
  maxFileSize: number;
  /** Whether to use Tree-sitter fallback when Clang is unavailable */
  useTreeSitterFallback: boolean;
}

// ─── Index ────────────────────────────────────────────────────

export interface CodebaseIndex {
  files: CppFileInfo[];
  symbols: Map<string, CppSymbol>;
  relationships: CppRelationship[];
  /** Build time in ms */
  buildTime: number;
  /** Timestamp */
  timestamp: number;
}
