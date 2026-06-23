/**
 * Workspace scanner: recursively finds C++ source files,
 * respects exclude patterns and max-file-size settings.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CppFileInfo } from '../types/analysis';
import { isCppFile } from './parser';

export interface ScanOptions {
  workspaceRoot: string;
  excludePatterns: string[];
  maxFileSize: number;
}

export interface ScanResult {
  files: string[];
  hasCompileCommands: boolean;
  compileCommandsPath?: string;
}

/**
 * Convert a glob-style pattern to a RegExp.
 * Supports **, *, and ? wildcards.
 */
function globToRegex(pattern: string): RegExp {
  // Normalize separators
  let re = pattern.replace(/\\/g, '/');

  // Escape regex special chars except * and ?
  re = re.replace(/[.+^${}()|[\]]/g, '\\$&');

  // Convert glob wildcards
  re = re.replace(/\*\*/g, '<<DOUBLESTAR>>');
  re = re.replace(/\*/g, '[^/]*');
  re = re.replace(/<<DOUBLESTAR>>/g, '.*');
  re = re.replace(/\?/g, '[^/]');

  return new RegExp(`^${re}$`);
}

function shouldExclude(relativePath: string, excludePatterns: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  for (const pattern of excludePatterns) {
    const re = globToRegex(pattern);
    if (re.test(normalized)) return true;
    // Also check if any parent path segment matches
    if (re.test(`/${normalized}`)) return true;
    // Check without leading slash
    const withoutLeading = normalized.startsWith('/') ? normalized.slice(1) : normalized;
    if (re.test(withoutLeading)) return true;
  }
  return false;
}

function scanDirectory(
  dir: string,
  root: string,
  options: ScanOptions,
  results: string[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (shouldExclude(relativePath, options.excludePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath, root, options, results);
    } else if (entry.isFile() && isCppFile(entry.name)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size <= options.maxFileSize) {
          results.push(fullPath);
        }
      } catch {
        // Skip files we can't stat
      }
    }
  }
}

export function scanWorkspace(options: ScanOptions): ScanResult {
  const files: string[] = [];

  scanDirectory(options.workspaceRoot, options.workspaceRoot, options, files);

  // Check for compile_commands.json
  let hasCompileCommands = false;
  let compileCommandsPath: string | undefined;

  const candidates = [
    path.join(options.workspaceRoot, 'compile_commands.json'),
    path.join(options.workspaceRoot, 'build', 'compile_commands.json'),
    path.join(options.workspaceRoot, 'cmake-build-debug', 'compile_commands.json'),
    path.join(options.workspaceRoot, 'cmake-build-release', 'compile_commands.json'),
    path.join(options.workspaceRoot, 'out', 'compile_commands.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      hasCompileCommands = true;
      compileCommandsPath = candidate;
      break;
    }
  }

  return { files, hasCompileCommands, compileCommandsPath };
}

/**
 * Read and parse a single C++ file, returning a lightweight CppFileInfo stub
 * with just path metadata (symbols are filled later by the parser).
 */
export function readCppFile(filePath: string, workspaceRoot: string): Pick<CppFileInfo, 'path' | 'relativePath' | 'isHeader'> {
  const relativePath = path.relative(workspaceRoot, filePath);
  const isHeader = /\.(h|hpp|hxx|hh|h\+\+)$/i.test(filePath);
  return { path: filePath, relativePath, isHeader };
}
