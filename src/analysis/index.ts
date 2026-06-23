/**
 * Analysis engine public API.
 */

export { parseCppFile, isCppFile, resetIdCounter } from './parser';
export type { ParsedFile, CallSite, MemberTypeInfo, InheritanceInfo } from './parser';

export { scanWorkspace, readCppFile } from './scanner';
export type { ScanOptions, ScanResult } from './scanner';

export { buildIndex } from './indexer';

export { buildGraph, resetEdgeCounter } from './graphBuilder';

export { analyzeWorkspace, analyzeFiles, clearCache } from './manager';
export type { AnalysisProgress, ProgressCallback } from './manager';
