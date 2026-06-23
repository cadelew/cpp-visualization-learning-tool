/**
 * C++ source file parser using regex/heuristic analysis.
 *
 * Extracts symbols (namespaces, classes, structs, functions, methods, etc.)
 * and relationships (includes, inheritance, calls, composition) from C++ files.
 */

import {
  CppSymbol,
  CppFileInfo,
  IncludeDirective,
  SymbolKind,
  AccessSpecifier,
} from '../types/analysis';
import { SourceLocation } from '../types/graph';

// ─── Helpers ────────────────────────────────────────────────────

let nextId = 0;

export function resetIdCounter(): void {
  nextId = 0;
}

function genId(kind: string, name: string): string {
  return `${kind}::${name}::${nextId++}`;
}

function loc(file: string, startLine: number, endLine?: number): SourceLocation {
  return {
    file,
    startLine,
    startCol: 0,
    endLine: endLine ?? startLine,
    endCol: 0,
  };
}

// ─── Regex patterns ────────────────────────────────────────────

const INCLUDE_RE = /^\s*#include\s+([<"])([^>"]+)[>"]/;
const NAMESPACE_OPEN_RE = /^\s*namespace\s+(\w[\w:]*)\s*\{/;
const CLASS_RE = /^\s*(template\s*<[^>]*>\s*)?(class|struct)\s+(\w+)\s*(?:final\s*)?(?::\s*(.+?))?\s*\{/;
const ENUM_RE = /^\s*enum\s+(?:class\s+)?(\w+)/;
const TYPEDEF_RE = /^\s*(?:typedef\s+.+\s+(\w+)\s*;|using\s+(\w+)\s*=)/;
const FREE_FUNC_RE = /^(?!\s*(if|else|for|while|switch|return|catch|throw|delete|new|using|typedef|namespace|class|struct|enum)\b)\s*(?:(?:static|inline|virtual|explicit|constexpr|extern|friend)\s+)*(?:[\w:]+(?:<[^>]*>)?[\s*&]+)(\w+)\s*\(([^)]*)\)\s*(?:const)?\s*(?:noexcept)?\s*(?:override)?\s*(?:=\s*(?:0|default|delete))?\s*[{;]/;
const METHOD_IMPL_RE = /^(?!\s*(if|else|for|while|switch|return|catch|throw)\b)\s*(?:[\w:]+(?:<[^>]*>)?[\s*&]+)?(\w+)::(\w+)\s*\(([^)]*)\)\s*(?:const)?\s*(?:noexcept)?\s*(?:override)?\s*(?::\s*[^{]*)?\s*\{/;
const CONSTRUCTOR_IMPL_RE = /^\s*(\w+)::(\1)\s*\(([^)]*)\)\s*(?::\s*[^{]*)?\s*\{/;
const DESTRUCTOR_IMPL_RE = /^\s*(\w+)::~(\1)\s*\([^)]*\)\s*\{/;
const ACCESS_RE = /^\s*(public|protected|private)\s*:/;
const MEMBER_VAR_RE = /^\s*(?:(?:static|mutable|const|volatile)\s+)*(?:std::)?(\w+(?:<[^>]*>)?(?:::?\w+(?:<[^>]*>)?)*)\s*[*&]*\s+(\w+)\s*(?:[{=;])/;
const FUNC_CALL_RE = /\b(\w+)\s*\(/g;

// ─── Brace tracking ────────────────────────────────────────────

function countBraces(line: string): number {
  let depth = 0;
  let inString = false;
  let inChar = false;
  let escape = false;
  for (const ch of line) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"' && !inChar) { inString = !inString; continue; }
    if (ch === "'" && !inString) { inChar = !inChar; continue; }
    if (inString || inChar) continue;
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  return depth;
}

function stripLineComment(line: string): string {
  let inString = false;
  let inChar = false;
  let escape = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"' && !inChar) { inString = !inString; continue; }
    if (ch === "'" && !inString) { inChar = !inChar; continue; }
    if (inString || inChar) continue;
    if (ch === '/' && i + 1 < line.length && line[i + 1] === '/') {
      return line.slice(0, i);
    }
  }
  return line;
}

// ─── Parse result for a single file ────────────────────────────

export interface ParsedFile {
  file: CppFileInfo;
  callSites: CallSite[];
  memberTypes: MemberTypeInfo[];
  inheritances: InheritanceInfo[];
}

export interface CallSite {
  callerContext: string;
  calleeName: string;
  location: SourceLocation;
}

export interface MemberTypeInfo {
  ownerClass: string;
  memberName: string;
  typeName: string;
  location: SourceLocation;
}

export interface InheritanceInfo {
  derived: string;
  bases: { name: string; access: AccessSpecifier }[];
  location: SourceLocation;
}

// ─── Main parse function ────────────────────────────────────────

export function parseCppFile(filePath: string, content: string): ParsedFile {
  const lines = content.split('\n');
  const relativePath = filePath;

  const includes: IncludeDirective[] = [];
  const symbols: CppSymbol[] = [];
  const callSites: CallSite[] = [];
  const memberTypes: MemberTypeInfo[] = [];
  const inheritances: InheritanceInfo[] = [];

  const namespaceStack: string[] = [];
  const classStack: { name: string; braceDepth: number }[] = [];
  let currentAccess: AccessSpecifier = 'private';
  let braceDepth = 0;
  let inBlockComment = false;
  let locCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let line = lines[i];

    // Handle block comments
    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx === -1) continue;
      line = line.slice(endIdx + 2);
      inBlockComment = false;
    }

    // Strip block comments that start and end on same line
    line = line.replace(/\/\*.*?\*\//g, '');
    if (line.includes('/*')) {
      inBlockComment = true;
      line = line.slice(0, line.indexOf('/*'));
    }

    line = stripLineComment(line);
    const trimmed = line.trim();

    if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      locCount++;
    }

    // Track access specifiers inside classes
    const accessMatch = trimmed.match(ACCESS_RE);
    if (accessMatch && classStack.length > 0) {
      currentAccess = accessMatch[1] as AccessSpecifier;
      continue;
    }

    // Includes
    const includeMatch = trimmed.match(INCLUDE_RE);
    if (includeMatch) {
      includes.push({
        path: includeMatch[2],
        isSystem: includeMatch[1] === '<',
        location: loc(filePath, lineNum),
      });
      continue;
    }

    // Namespace
    const nsMatch = trimmed.match(NAMESPACE_OPEN_RE);
    if (nsMatch) {
      const nsName = nsMatch[1];
      const qualifiedName = namespaceStack.length > 0
        ? `${namespaceStack.join('::')}::${nsName}`
        : nsName;
      namespaceStack.push(nsName);

      symbols.push({
        id: genId('namespace', qualifiedName),
        kind: 'namespace',
        name: nsName,
        qualifiedName,
        location: loc(filePath, lineNum),
      });

      braceDepth += countBraces(trimmed);
      continue;
    }

    // Class / Struct
    const classMatch = trimmed.match(CLASS_RE);
    if (classMatch) {
      const templateStr = classMatch[1]?.trim();
      const classKind = classMatch[2] as 'class' | 'struct';
      const className = classMatch[3];
      const basesStr = classMatch[4];

      const prefix = namespaceStack.length > 0
        ? `${namespaceStack.join('::')}::`
        : '';
      const qualifiedName = `${prefix}${className}`;

      const sym: CppSymbol = {
        id: genId(classKind, qualifiedName),
        kind: classKind,
        name: className,
        qualifiedName,
        location: loc(filePath, lineNum),
      };

      if (templateStr) {
        const tpMatch = templateStr.match(/<([^>]+)>/);
        if (tpMatch) {
          sym.templateParams = tpMatch[1].split(',').map(p => p.trim());
        }
      }

      if (namespaceStack.length > 0) {
        const nsQualified = namespaceStack.join('::');
        const parentNs = symbols.find(
          s => s.kind === 'namespace' && s.qualifiedName === nsQualified
        );
        if (parentNs) sym.parentId = parentNs.id;
      }

      symbols.push(sym);

      if (basesStr) {
        const bases = parseBaseClasses(basesStr);
        if (bases.length > 0) {
          inheritances.push({
            derived: qualifiedName,
            bases,
            location: loc(filePath, lineNum),
          });
        }
      }

      const depthChange = countBraces(trimmed);
      braceDepth += depthChange;
      classStack.push({ name: qualifiedName, braceDepth });
      currentAccess = classKind === 'class' ? 'private' : 'public';
      continue;
    }

    // Enum
    const enumMatch = trimmed.match(ENUM_RE);
    if (enumMatch) {
      const enumName = enumMatch[1];
      const prefix = [...namespaceStack, ...classStack.map(c => c.name.split('::').pop()!)]
        .join('::');
      const qualifiedName = prefix ? `${prefix}::${enumName}` : enumName;
      symbols.push({
        id: genId('enum', qualifiedName),
        kind: 'enum',
        name: enumName,
        qualifiedName,
        location: loc(filePath, lineNum),
      });
      braceDepth += countBraces(trimmed);
      continue;
    }

    // Typedef / using alias
    const typedefMatch = trimmed.match(TYPEDEF_RE);
    if (typedefMatch) {
      const tdName = typedefMatch[1] ?? typedefMatch[2];
      if (tdName) {
        const prefix = namespaceStack.join('::');
        const qualifiedName = prefix ? `${prefix}::${tdName}` : tdName;
        symbols.push({
          id: genId('typedef', qualifiedName),
          kind: 'typedef',
          name: tdName,
          qualifiedName,
          location: loc(filePath, lineNum),
        });
      }
      braceDepth += countBraces(trimmed);
      continue;
    }

    // Destructor implementation (e.g. Foo::~Foo())
    const dtorMatch = trimmed.match(DESTRUCTOR_IMPL_RE);
    if (dtorMatch) {
      const ownerClass = dtorMatch[1];
      const prefix = namespaceStack.join('::');
      const ownerQualified = prefix ? `${prefix}::${ownerClass}` : ownerClass;
      const qualifiedName = `${ownerQualified}::~${ownerClass}`;

      symbols.push({
        id: genId('destructor', qualifiedName),
        kind: 'destructor',
        name: `~${ownerClass}`,
        qualifiedName,
        location: loc(filePath, lineNum),
      });

      braceDepth += countBraces(trimmed);
      extractCallSites(trimmed, qualifiedName, filePath, lineNum, callSites);
      continue;
    }

    // Constructor implementation (e.g. Foo::Foo())
    const ctorMatch = trimmed.match(CONSTRUCTOR_IMPL_RE);
    if (ctorMatch) {
      const ownerClass = ctorMatch[1];
      const prefix = namespaceStack.join('::');
      const ownerQualified = prefix ? `${prefix}::${ownerClass}` : ownerClass;
      const qualifiedName = `${ownerQualified}::${ownerClass}`;

      symbols.push({
        id: genId('constructor', qualifiedName),
        kind: 'constructor',
        name: ownerClass,
        qualifiedName,
        location: loc(filePath, lineNum),
        paramTypes: parseParamTypes(ctorMatch[3]),
      });

      braceDepth += countBraces(trimmed);
      extractCallSites(trimmed, qualifiedName, filePath, lineNum, callSites);
      continue;
    }

    // Method implementation (e.g. Foo::bar())
    const methodMatch = trimmed.match(METHOD_IMPL_RE);
    if (methodMatch) {
      const ownerClass = methodMatch[2];
      const methodName = methodMatch[3];
      const params = methodMatch[4];
      const prefix = namespaceStack.join('::');
      const ownerQualified = prefix ? `${prefix}::${ownerClass}` : ownerClass;
      const qualifiedName = `${ownerQualified}::${methodName}`;
      const isConst = /\)\s*const/.test(trimmed);

      symbols.push({
        id: genId('method', qualifiedName),
        kind: 'method',
        name: methodName,
        qualifiedName,
        location: loc(filePath, lineNum),
        isConst,
        paramTypes: parseParamTypes(params),
      });

      braceDepth += countBraces(trimmed);
      extractCallSites(trimmed, qualifiedName, filePath, lineNum, callSites);
      continue;
    }

    // Member variables inside class bodies
    if (classStack.length > 0) {
      const memberMatch = trimmed.match(MEMBER_VAR_RE);
      if (memberMatch && !trimmed.includes('(')) {
        const typeName = memberMatch[1];
        const memberName = memberMatch[2];
        const currentClass = classStack[classStack.length - 1].name;
        const qualifiedName = `${currentClass}::${memberName}`;

        symbols.push({
          id: genId('field', qualifiedName),
          kind: 'field',
          name: memberName,
          qualifiedName,
          location: loc(filePath, lineNum),
          access: currentAccess,
        });

        memberTypes.push({
          ownerClass: currentClass,
          memberName,
          typeName,
          location: loc(filePath, lineNum),
        });
      }

      // Method declarations inside class (not implementations)
      const inlineMethodMatch = trimmed.match(
        /^\s*(?:(?:static|inline|virtual|explicit|constexpr|friend)\s+)*(?:[\w:]+(?:<[^>]*>)?[\s*&]+)?(\w+)\s*\(([^)]*)\)\s*(?:const)?\s*(?:noexcept)?\s*(?:override)?\s*(?:=\s*(?:0|default|delete))?\s*[;{]/
      );
      if (inlineMethodMatch && !memberMatch) {
        const methodName = inlineMethodMatch[1];
        const params = inlineMethodMatch[2];
        const currentClass = classStack[classStack.length - 1].name;

        // Skip keywords
        const skipWords = new Set(['if', 'else', 'for', 'while', 'switch', 'return', 'catch', 'throw', 'delete', 'new', 'using', 'typedef']);
        if (!skipWords.has(methodName)) {
          const qualifiedName = `${currentClass}::${methodName}`;
          const isVirtual = /\bvirtual\b/.test(trimmed);
          const isStatic = /\bstatic\b/.test(trimmed);
          const isConst = /\)\s*const/.test(trimmed);
          const isPureVirtual = /=\s*0\s*;/.test(trimmed);

          // Check if it's a constructor
          const classBaseName = currentClass.split('::').pop()!;
          let kind: SymbolKind = 'method';
          if (methodName === classBaseName) {
            kind = 'constructor';
          } else if (methodName === `~${classBaseName}`) {
            kind = 'destructor';
          }

          symbols.push({
            id: genId(kind, qualifiedName),
            kind,
            name: methodName,
            qualifiedName,
            location: loc(filePath, lineNum),
            access: currentAccess,
            isVirtual: isVirtual || isPureVirtual || undefined,
            isStatic: isStatic || undefined,
            isConst: isConst || undefined,
            paramTypes: parseParamTypes(params),
          });
        }
      }
    }

    // Free functions (not inside a class)
    if (classStack.length === 0) {
      const funcMatch = trimmed.match(FREE_FUNC_RE);
      if (funcMatch) {
        const funcName = funcMatch[2];
        if (funcName) {
          const prefix = namespaceStack.join('::');
          const qualifiedName = prefix ? `${prefix}::${funcName}` : funcName;

          symbols.push({
            id: genId('function', qualifiedName),
            kind: 'function',
            name: funcName,
            qualifiedName,
            location: loc(filePath, lineNum),
            paramTypes: parseParamTypes(funcMatch[3]),
          });

          extractCallSites(trimmed, qualifiedName, filePath, lineNum, callSites);
        }
      }
    }

    // Track brace depth and pop stacks
    const prevDepth = braceDepth;
    braceDepth += countBraces(trimmed);

    // Pop class stack if we've closed a class body
    while (classStack.length > 0 && braceDepth < classStack[classStack.length - 1].braceDepth) {
      classStack.pop();
      currentAccess = classStack.length > 0
        ? 'private'
        : 'public';
    }

    // Pop namespace if depth dropped below where it started
    if (braceDepth < prevDepth && namespaceStack.length > 0 && classStack.length === 0) {
      if (braceDepth < namespaceStack.length) {
        namespaceStack.pop();
      }
    }

    // Extract call sites from lines inside function/method bodies
    if (braceDepth > 0 && classStack.length === 0) {
      extractCallSites(trimmed, '', filePath, lineNum, callSites);
    }
  }

  const isHeader = /\.(h|hpp|hxx|hh)$/i.test(filePath);

  const fileInfo: CppFileInfo = {
    path: filePath,
    relativePath,
    isHeader,
    loc: locCount,
    includes,
    symbols,
  };

  return { file: fileInfo, callSites, memberTypes, inheritances };
}

// ─── Helper: parse base class list ─────────────────────────────

function parseBaseClasses(basesStr: string): { name: string; access: AccessSpecifier }[] {
  const results: { name: string; access: AccessSpecifier }[] = [];
  const parts = basesStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const match = trimmed.match(/(?:(public|protected|private)\s+)?(\w[\w:]*)/);
    if (match) {
      results.push({
        name: match[2],
        access: (match[1] as AccessSpecifier) ?? 'private',
      });
    }
  }
  return results;
}

// ─── Helper: parse parameter types ──────────────────────────────

function parseParamTypes(params: string): string[] {
  if (!params || params.trim() === '' || params.trim() === 'void') return [];
  return params.split(',').map(p => {
    const trimmed = p.trim();
    // Remove parameter name, keep type
    const parts = trimmed.replace(/\s*=[^,]+$/, '').split(/\s+/);
    if (parts.length <= 1) return trimmed;
    // Last token might be the name; remove it unless it looks like a type keyword
    const typeKeywords = new Set(['int', 'char', 'float', 'double', 'void', 'bool', 'long', 'short', 'unsigned', 'signed', 'auto']);
    const last = parts[parts.length - 1].replace(/[*&]+$/, '');
    if (typeKeywords.has(last)) return trimmed;
    return parts.slice(0, -1).join(' ');
  });
}

// ─── Helper: extract function call sites ────────────────────────

function extractCallSites(
  line: string,
  callerContext: string,
  file: string,
  lineNum: number,
  out: CallSite[],
): void {
  const skipNames = new Set([
    'if', 'else', 'for', 'while', 'switch', 'return', 'catch', 'throw',
    'sizeof', 'alignof', 'decltype', 'static_cast', 'dynamic_cast',
    'const_cast', 'reinterpret_cast', 'new', 'delete', 'typeid',
  ]);

  let match: RegExpExecArray | null;
  const re = new RegExp(FUNC_CALL_RE.source, 'g');
  while ((match = re.exec(line)) !== null) {
    const name = match[1];
    if (!skipNames.has(name) && name.length > 0) {
      out.push({
        callerContext,
        calleeName: name,
        location: loc(file, lineNum),
      });
    }
  }
}

// ─── Supported extensions ───────────────────────────────────────

const CPP_EXTENSIONS = new Set([
  '.cpp', '.cc', '.cxx', '.c++',
  '.h', '.hpp', '.hxx', '.hh', '.h++',
]);

export function isCppFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return CPP_EXTENSIONS.has(ext);
}
