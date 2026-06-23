/**
 * Analysis Manager: orchestrates the full analysis pipeline.
 *
 * Pipeline: scan → parse → index → build graph
 *
 * Supports progress reporting, caching, and incremental updates.
 */

import * as fs from 'fs';
import { AnalysisConfig } from '../types/analysis';
import { AnalysisResult, AnalysisError } from '../types/graph';
import { parseCppFile, ParsedFile, resetIdCounter } from './parser';
import { scanWorkspace, ScanOptions } from './scanner';
import { buildIndex } from './indexer';
import { buildGraph, resetEdgeCounter } from './graphBuilder';

// ─── Progress reporting ─────────────────────────────────────────

export interface AnalysisProgress {
  phase: 'scanning' | 'parsing' | 'indexing' | 'building';
  percent: number;
  message: string;
}

export type ProgressCallback = (progress: AnalysisProgress) => void;

// ─── Cache ──────────────────────────────────────────────────────

interface CacheEntry {
  parsed: ParsedFile;
  mtime: number;
}

const fileCache = new Map<string, CacheEntry>();

export function clearCache(): void {
  fileCache.clear();
}

// ─── Main analysis function ─────────────────────────────────────

export async function analyzeWorkspace(
  config: AnalysisConfig,
  onProgress?: ProgressCallback,
): Promise<AnalysisResult> {
  resetIdCounter();
  resetEdgeCounter();

  const errors: AnalysisError[] = [];

  // Phase 1: Scan
  onProgress?.({
    phase: 'scanning',
    percent: 0,
    message: 'Scanning workspace for C++ files...',
  });

  const scanOptions: ScanOptions = {
    workspaceRoot: config.workspaceRoot,
    excludePatterns: config.excludePatterns,
    maxFileSize: config.maxFileSize,
  };

  const scanResult = scanWorkspace(scanOptions);

  onProgress?.({
    phase: 'scanning',
    percent: 100,
    message: `Found ${scanResult.files.length} C++ files`,
  });

  // Phase 2: Parse
  const parsedFiles: ParsedFile[] = [];
  const totalFiles = scanResult.files.length;

  for (let i = 0; i < totalFiles; i++) {
    const filePath = scanResult.files[i];

    onProgress?.({
      phase: 'parsing',
      percent: Math.round((i / totalFiles) * 100),
      message: `Parsing ${filePath}`,
    });

    try {
      // Check cache
      const stat = fs.statSync(filePath);
      const cached = fileCache.get(filePath);
      if (cached && cached.mtime === stat.mtimeMs) {
        parsedFiles.push(cached.parsed);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseCppFile(filePath, content);
      parsedFiles.push(parsed);

      // Update cache
      fileCache.set(filePath, { parsed, mtime: stat.mtimeMs });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        file: filePath,
        message: `Failed to parse: ${message}`,
        severity: 'error',
      });
    }
  }

  onProgress?.({
    phase: 'parsing',
    percent: 100,
    message: `Parsed ${parsedFiles.length} files`,
  });

  // Phase 3: Index
  onProgress?.({
    phase: 'indexing',
    percent: 0,
    message: 'Building codebase index...',
  });

  const index = buildIndex(parsedFiles, config.workspaceRoot);

  onProgress?.({
    phase: 'indexing',
    percent: 100,
    message: `Indexed ${index.symbols.size} symbols, ${index.relationships.length} relationships`,
  });

  // Phase 4: Build graph
  onProgress?.({
    phase: 'building',
    percent: 0,
    message: 'Building visualization graph...',
  });

  const result = buildGraph(index, config.workspaceRoot);

  // Merge errors
  result.errors = [...result.errors, ...errors];

  // Update duration to include full pipeline time
  result.duration = index.buildTime;

  onProgress?.({
    phase: 'building',
    percent: 100,
    message: `Graph built: ${result.graph.nodes.length} nodes, ${result.graph.edges.length} edges`,
  });

  return result;
}

// ─── Incremental analysis ───────────────────────────────────────

export async function analyzeFiles(
  filePaths: string[],
  config: AnalysisConfig,
  onProgress?: ProgressCallback,
): Promise<ParsedFile[]> {
  const results: ParsedFile[] = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    onProgress?.({
      phase: 'parsing',
      percent: Math.round((i / filePaths.length) * 100),
      message: `Re-parsing ${filePath}`,
    });

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseCppFile(filePath, content);
      results.push(parsed);

      // Update cache
      const stat = fs.statSync(filePath);
      fileCache.set(filePath, { parsed, mtime: stat.mtimeMs });
    } catch (err) {
      // Skip files that can't be read
    }
  }

  return results;
}
