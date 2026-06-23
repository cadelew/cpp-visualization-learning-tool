/**
 * Indexer: builds a CodebaseIndex from parsed files.
 *
 * Resolves cross-file relationships:
 *  - #include → file dependencies
 *  - inheritance hierarchies
 *  - function/method call graphs
 *  - composition (member types)
 */

import * as path from 'path';
import {
  CppSymbol,
  CppFileInfo,
  CppRelationship,
  CodebaseIndex,
  IncludeDirective,
} from '../types/analysis';
import { ParsedFile } from './parser';

// ─── Include resolution ─────────────────────────────────────────

function resolveInclude(
  directive: IncludeDirective,
  currentFile: string,
  fileIndex: Map<string, string>,
  workspaceRoot: string,
): string | undefined {
  if (directive.isSystem) return undefined;

  const includeTarget = directive.path;

  // Try relative to the including file
  const currentDir = path.dirname(currentFile);
  const relativeCandidate = path.resolve(currentDir, includeTarget);
  if (fileIndex.has(relativeCandidate)) return relativeCandidate;

  // Try from workspace root
  const rootCandidate = path.resolve(workspaceRoot, includeTarget);
  if (fileIndex.has(rootCandidate)) return rootCandidate;

  // Try matching by basename
  const targetBase = path.basename(includeTarget);
  for (const [absPath] of fileIndex) {
    if (path.basename(absPath) === targetBase) return absPath;
  }

  return undefined;
}

// ─── Symbol lookup ──────────────────────────────────────────────

function buildQualifiedNameIndex(symbols: Map<string, CppSymbol>): Map<string, CppSymbol> {
  const byQualifiedName = new Map<string, CppSymbol>();
  for (const sym of symbols.values()) {
    byQualifiedName.set(sym.qualifiedName, sym);
    // Also index by bare name for unqualified lookups
    if (!byQualifiedName.has(sym.name)) {
      byQualifiedName.set(sym.name, sym);
    }
  }
  return byQualifiedName;
}

// ─── Main indexer ───────────────────────────────────────────────

export function buildIndex(
  parsedFiles: ParsedFile[],
  workspaceRoot: string,
): CodebaseIndex {
  const startTime = Date.now();

  const allFiles: CppFileInfo[] = [];
  const allSymbols = new Map<string, CppSymbol>();
  const relationships: CppRelationship[] = [];

  // Build file path index (absolute path → relative path)
  const fileIndex = new Map<string, string>();
  for (const pf of parsedFiles) {
    fileIndex.set(pf.file.path, pf.file.relativePath);
  }

  // Collect all symbols
  for (const pf of parsedFiles) {
    for (const sym of pf.file.symbols) {
      allSymbols.set(sym.id, sym);
    }
  }

  const byQualifiedName = buildQualifiedNameIndex(allSymbols);

  // Process each parsed file
  for (const pf of parsedFiles) {
    const fileInfo = { ...pf.file };

    // Resolve includes
    for (const inc of fileInfo.includes) {
      const resolved = resolveInclude(inc, fileInfo.path, fileIndex, workspaceRoot);
      if (resolved) {
        inc.resolvedPath = resolved;
      }
    }

    // Create include relationships
    for (const inc of fileInfo.includes) {
      if (inc.resolvedPath) {
        relationships.push({
          kind: 'includes',
          sourceId: fileInfo.path,
          targetId: inc.resolvedPath,
          location: inc.location,
        });
      }
    }

    // Process inheritance
    for (const inh of pf.inheritances) {
      const derivedSym = byQualifiedName.get(inh.derived);
      if (!derivedSym) continue;

      for (const base of inh.bases) {
        // Try to find the base class symbol
        const baseSym = byQualifiedName.get(base.name);
        if (baseSym) {
          relationships.push({
            kind: 'inherits',
            sourceId: derivedSym.id,
            targetId: baseSym.id,
            location: inh.location,
          });
        }
      }
    }

    // Process call sites
    for (const call of pf.callSites) {
      const calleeSym = byQualifiedName.get(call.calleeName);
      if (calleeSym && call.callerContext) {
        const callerSym = byQualifiedName.get(call.callerContext);
        if (callerSym) {
          relationships.push({
            kind: 'calls',
            sourceId: callerSym.id,
            targetId: calleeSym.id,
            location: call.location,
          });
        }
      }
    }

    // Process member types (composition)
    for (const mt of pf.memberTypes) {
      const ownerSym = byQualifiedName.get(mt.ownerClass);
      const typeSym = byQualifiedName.get(mt.typeName);
      if (ownerSym && typeSym) {
        relationships.push({
          kind: 'uses_type',
          sourceId: ownerSym.id,
          targetId: typeSym.id,
          location: mt.location,
        });
      }
    }

    // Create has_member relationships for class members
    for (const sym of fileInfo.symbols) {
      if (sym.parentId) {
        relationships.push({
          kind: 'has_member',
          sourceId: sym.parentId,
          targetId: sym.id,
          location: sym.location,
        });
      }
    }

    allFiles.push(fileInfo);
  }

  return {
    files: allFiles,
    symbols: allSymbols,
    relationships,
    buildTime: Date.now() - startTime,
    timestamp: Date.now(),
  };
}
