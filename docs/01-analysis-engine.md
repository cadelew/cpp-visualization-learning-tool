# Feature: Analysis Engine

The analysis engine scans, parses, indexes, and builds a graph from C++ source files. It is the core pipeline that powers the visualization.

## Pipeline Overview

```
scanWorkspace() -> parseCppFile() per file -> buildIndex() -> buildGraph()
```

**Entry point:** `src/analysis/manager.ts` — `analyzeWorkspace()`

---

## 1. Workspace Scanner (`src/analysis/scanner.ts`)

**Purpose:** Recursively discovers all C++ files in the workspace, respecting exclude patterns and file size limits.

### How It Works

1. Walks the directory tree starting from `workspaceRoot`
2. For each file, checks if it's a C++ file by extension (`.cpp`, `.cc`, `.cxx`, `.c++`, `.h`, `.hpp`, `.hxx`, `.hh`, `.h++`)
3. Skips files matching exclude glob patterns (e.g., `**/build/**`, `**/node_modules/**`)
4. Skips files exceeding `maxFileSize` (default: 1 MB)
5. Checks for `compile_commands.json` in common locations

### Key Code

```typescript
// src/analysis/scanner.ts

export interface ScanOptions {
  workspaceRoot: string;
  excludePatterns: string[];   // Glob patterns like '**/build/**'
  maxFileSize: number;         // Bytes, default 1048576
}

export interface ScanResult {
  files: string[];              // Absolute paths to C++ files
  hasCompileCommands: boolean;
  compileCommandsPath?: string;
}

export function scanWorkspace(options: ScanOptions): ScanResult {
  const files: string[] = [];
  scanDirectory(options.workspaceRoot, options.workspaceRoot, options, files);

  // Check for compile_commands.json in:
  //   <root>/compile_commands.json
  //   <root>/build/compile_commands.json
  //   <root>/cmake-build-debug/compile_commands.json
  //   <root>/cmake-build-release/compile_commands.json
  //   <root>/out/compile_commands.json

  return { files, hasCompileCommands, compileCommandsPath };
}
```

### Glob Pattern Matching

Patterns are converted to RegExp internally. Supported wildcards:
- `**` matches any directory depth
- `*` matches any characters except `/`
- `?` matches a single non-`/` character

---

## 2. C++ Parser (`src/analysis/parser.ts`)

**Purpose:** Extracts symbols and relationships from a single C++ file using regex and heuristic analysis.

### What It Extracts

| Category | Symbols Extracted |
|---|---|
| **Containers** | Namespaces, classes, structs, enums |
| **Functions** | Free functions, methods, constructors, destructors |
| **Members** | Fields (member variables), typedefs/using aliases |
| **Relationships** | `#include` directives, inheritance (base classes), function call sites, member type references |

### How It Works

The parser processes each file line-by-line with these steps:

1. **Comment handling:** Strips `//` line comments and `/* ... */` block comments
2. **Brace tracking:** Maintains a `braceDepth` counter to know when we're inside class/function bodies
3. **Regex matching:** Each line is tested against a set of patterns (in priority order):
   - `#include` directives
   - `namespace Name {`
   - `class/struct Name : Base {`
   - `enum (class)? Name`
   - `typedef ... Name;` / `using Name = ...`
   - Destructor implementations (`Foo::~Foo()`)
   - Constructor implementations (`Foo::Foo()`)
   - Method implementations (`Foo::bar()`)
   - Member variable declarations (inside class bodies)
   - Inline method declarations (inside class bodies)
   - Free function definitions (outside class bodies)

4. **Call site extraction:** For each function/method body, extracts function calls using `/\b(\w+)\s*\(/g`, filtering out keywords like `if`, `for`, `sizeof`, etc.

5. **Scope tracking:** Maintains `namespaceStack` and `classStack` to build fully qualified names (e.g., `MyNamespace::MyClass::myMethod`)

### Key Regex Patterns

```typescript
// #include <header> or "header"
const INCLUDE_RE = /^\s*#include\s+([<"])([^>"]+)[>"]/;

// namespace Name {
const NAMESPACE_OPEN_RE = /^\s*namespace\s+(\w[\w:]*)\s*\{/;

// class/struct Name : public Base {
const CLASS_RE = /^\s*(template\s*<[^>]*>\s*)?(class|struct)\s+(\w+)\s*(?:final\s*)?(?::\s*(.+?))?\s*\{/;

// Free function: ReturnType name(params) {
const FREE_FUNC_RE = /^(?!\s*(if|else|for|...))\s*...([\w:]+)\s*\(([^)]*)\)\s*...{/;

// Method implementation: Class::method(params) {
const METHOD_IMPL_RE = /^...\s*(\w+)::(\w+)\s*\(([^)]*)\)\s*...{/;
```

### Output

```typescript
export interface ParsedFile {
  file: CppFileInfo;        // File metadata + all symbols found
  callSites: CallSite[];    // Function calls detected in bodies
  memberTypes: MemberTypeInfo[];  // Member variable type references
  inheritances: InheritanceInfo[];  // class Derived : public Base
}
```

### Symbol Schema

```typescript
interface CppSymbol {
  id: string;               // e.g., "class::MyNamespace::MyClass::3"
  kind: SymbolKind;         // 'namespace' | 'class' | 'struct' | 'function' | 'method' | ...
  name: string;             // Short name (e.g., "MyClass")
  qualifiedName: string;    // Full name (e.g., "MyNamespace::MyClass")
  location: SourceLocation; // File path + line numbers
  access?: AccessSpecifier; // 'public' | 'protected' | 'private'
  isVirtual?: boolean;
  isStatic?: boolean;
  isConst?: boolean;
  templateParams?: string[];
  paramTypes?: string[];
  parentId?: string;        // Parent symbol (e.g., enclosing namespace)
}
```

---

## 3. Indexer (`src/analysis/indexer.ts`)

**Purpose:** Resolves cross-file relationships from parsed files into a unified `CodebaseIndex`.

### What It Resolves

| Relationship | Resolution Method |
|---|---|
| `#include` | Tries relative path, workspace root path, then basename matching |
| Inheritance | Matches `class Derived : Base` to the `Base` symbol by qualified/bare name |
| Function calls | Matches call site names to known function/method symbols |
| Composition | Matches member variable types to class/struct symbols |
| Containment | Links symbols to their parent (namespace, class) via `parentId` |

### Key Code

```typescript
// src/analysis/indexer.ts

export function buildIndex(
  parsedFiles: ParsedFile[],
  workspaceRoot: string,
): CodebaseIndex {
  // 1. Collect all symbols into a Map<id, CppSymbol>
  // 2. Build qualified name lookup index (also indexes bare names)
  // 3. For each file:
  //    a. Resolve #include paths
  //    b. Create 'includes' relationships
  //    c. Resolve inheritance (derived -> base)
  //    d. Resolve call sites (caller -> callee)
  //    e. Resolve member types (class -> member type)
  //    f. Create 'has_member' relationships (parent -> child)
  // 4. Return CodebaseIndex { files, symbols, relationships, buildTime }
}
```

### Include Resolution Strategy

```
1. Try relative to the including file's directory
2. Try relative to workspace root
3. Try matching by basename (fallback)
4. If all fail: include is unresolved (silently skipped)
```

---

## 4. Graph Builder (`src/analysis/graphBuilder.ts`)

**Purpose:** Converts the `CodebaseIndex` into a `CodebaseGraph` suitable for visualization.

### What It Creates

| Output | Description |
|---|---|
| **File nodes** | One `GraphNode` per C++ file with `kind: 'file'` |
| **Symbol nodes** | One `GraphNode` per namespace, class, struct, function, method |
| **Contains edges** | File -> top-level symbols |
| **Include edges** | File -> included file |
| **Relationship edges** | inherits, calls, depends_on, contains (from indexer) |
| **Subsystem nodes** | Auto-detected from top-level directory structure |

### Node Kind Mapping

```typescript
// CppSymbol kind -> GraphNode kind
const SYMBOL_TO_NODE_KIND = {
  file: 'file',
  namespace: 'namespace',
  class: 'class',
  struct: 'struct',
  function: 'function',
  method: 'method',
  constructor: 'method',  // constructors map to 'method'
  destructor: 'method',   // destructors map to 'method'
};
// Note: fields, enums, typedefs are NOT visualized as nodes
```

### Edge Confidence Scores

```typescript
const RELATIONSHIP_MAPPING = {
  includes:                { kind: 'includes',   confidence: 0.95 },
  inherits:                { kind: 'inherits',   confidence: 0.95 },
  calls:                   { kind: 'calls',      confidence: 0.70 },
  uses_type:               { kind: 'depends_on', confidence: 0.70 },
  has_member:              { kind: 'contains',   confidence: 0.95 },
  implements:              { kind: 'inherits',   confidence: 0.95 },
  overrides:               { kind: 'calls',      confidence: 0.80 },
  instantiates_template:   { kind: 'depends_on', confidence: 0.80 },
  friend_of:               { kind: 'depends_on', confidence: 0.70 },
};
```

### Subsystem Detection

Subsystems are auto-detected from the top-level directory structure:

```typescript
function detectSubsystems(index, workspaceRoot): Subsystem[] {
  // Group files by their top-level directory (e.g., "src", "lib", "core")
  // Each directory becomes a Subsystem with:
  //   - All file nodes in that directory
  //   - All symbol nodes from those files
  //   - A pathPattern like "src/**"
}
```

---

## 5. Analysis Manager (`src/analysis/manager.ts`)

**Purpose:** Orchestrates the full pipeline with progress reporting and caching.

### Pipeline Phases

| Phase | Percent | Description |
|---|---|---|
| `scanning` | 0-10% | Finding C++ files |
| `parsing` | 10-60% | Parsing each file (with per-file progress) |
| `indexing` | 60-80% | Building cross-file index |
| `building` | 80-100% | Creating visualization graph |

### File Caching

Parsed files are cached by `mtime` (last modified timestamp). On subsequent analyses, unchanged files are served from cache:

```typescript
const fileCache = new Map<string, CacheEntry>();

interface CacheEntry {
  parsed: ParsedFile;
  mtime: number;  // file.mtimeMs from fs.statSync
}

// During parsing:
const stat = fs.statSync(filePath);
const cached = fileCache.get(filePath);
if (cached && cached.mtime === stat.mtimeMs) {
  parsedFiles.push(cached.parsed);  // Cache hit: skip re-parse
  continue;
}
```

### Entry Point

```typescript
export async function analyzeWorkspace(
  config: AnalysisConfig,
  onProgress?: ProgressCallback,
): Promise<AnalysisResult> {
  resetIdCounter();    // Reset parser ID counter
  resetEdgeCounter();  // Reset edge ID counter

  // Phase 1: Scan
  const scanResult = scanWorkspace(scanOptions);

  // Phase 2: Parse (with caching)
  for (const filePath of scanResult.files) {
    const parsed = parseCppFile(filePath, content);
    parsedFiles.push(parsed);
  }

  // Phase 3: Index
  const index = buildIndex(parsedFiles, config.workspaceRoot);

  // Phase 4: Build graph
  const result = buildGraph(index, config.workspaceRoot);

  return result;
}
```
