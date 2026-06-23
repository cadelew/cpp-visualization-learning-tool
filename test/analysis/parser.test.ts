import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseCppFile, resetIdCounter } from '../../src/analysis/parser';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

describe('C++ Parser', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('parseCppFile - sample.h', () => {
    const filePath = path.join(FIXTURES_DIR, 'sample.h');
    const content = fs.readFileSync(filePath, 'utf-8');

    it('should detect include directives', () => {
      const result = parseCppFile(filePath, content);
      const includes = result.file.includes;

      expect(includes.length).toBe(3);
      expect(includes[0].path).toBe('string');
      expect(includes[0].isSystem).toBe(true);
      expect(includes[1].path).toBe('vector');
      expect(includes[2].path).toBe('memory');
    });

    it('should detect the namespace', () => {
      const result = parseCppFile(filePath, content);
      const namespaces = result.file.symbols.filter(s => s.kind === 'namespace');

      expect(namespaces.length).toBe(1);
      expect(namespaces[0].name).toBe('myapp');
      expect(namespaces[0].qualifiedName).toBe('myapp');
    });

    it('should detect classes and structs', () => {
      const result = parseCppFile(filePath, content);
      const classes = result.file.symbols.filter(s => s.kind === 'class');
      const structs = result.file.symbols.filter(s => s.kind === 'struct');

      expect(classes.length).toBe(2);
      expect(classes.map(c => c.name)).toContain('Base');
      expect(classes.map(c => c.name)).toContain('Processor');

      expect(structs.length).toBe(1);
      expect(structs[0].name).toBe('Config');
    });

    it('should detect qualified names with namespace', () => {
      const result = parseCppFile(filePath, content);
      const processor = result.file.symbols.find(s => s.name === 'Processor');

      expect(processor).toBeDefined();
      expect(processor!.qualifiedName).toBe('myapp::Processor');
    });

    it('should detect inheritance', () => {
      const result = parseCppFile(filePath, content);

      expect(result.inheritances.length).toBeGreaterThanOrEqual(1);
      const procInh = result.inheritances.find(i => i.derived === 'myapp::Processor');
      expect(procInh).toBeDefined();
      expect(procInh!.bases[0].name).toBe('Base');
      expect(procInh!.bases[0].access).toBe('public');
    });

    it('should detect method declarations', () => {
      const result = parseCppFile(filePath, content);
      const methods = result.file.symbols.filter(
        s => s.kind === 'method' || s.kind === 'constructor' || s.kind === 'destructor'
      );

      const methodNames = methods.map(m => m.name);
      expect(methodNames).toContain('process');
      expect(methodNames).toContain('addItem');
      expect(methodNames).toContain('getCount');
    });

    it('should detect member variables', () => {
      const result = parseCppFile(filePath, content);
      const fields = result.file.symbols.filter(s => s.kind === 'field');

      expect(fields.length).toBeGreaterThanOrEqual(2);
      const fieldNames = fields.map(f => f.name);
      expect(fieldNames).toContain('m_name');
      expect(fieldNames).toContain('m_items');
    });

    it('should mark file as header', () => {
      const result = parseCppFile(filePath, content);
      expect(result.file.isHeader).toBe(true);
    });
  });

  describe('parseCppFile - sample.cpp', () => {
    const filePath = path.join(FIXTURES_DIR, 'sample.cpp');
    const content = fs.readFileSync(filePath, 'utf-8');

    it('should detect includes including local header', () => {
      const result = parseCppFile(filePath, content);
      const includes = result.file.includes;

      expect(includes.length).toBe(3);
      const localInc = includes.find(i => !i.isSystem);
      expect(localInc).toBeDefined();
      expect(localInc!.path).toBe('sample.h');
    });

    it('should detect method implementations', () => {
      const result = parseCppFile(filePath, content);
      const methods = result.file.symbols.filter(
        s => s.kind === 'method' || s.kind === 'constructor'
      );

      const methodNames = methods.map(m => m.name);
      expect(methodNames).toContain('process');
      expect(methodNames).toContain('addItem');
      expect(methodNames).toContain('getCount');
    });

    it('should detect constructor implementation', () => {
      const result = parseCppFile(filePath, content);
      const ctors = result.file.symbols.filter(s => s.kind === 'constructor');

      expect(ctors.length).toBeGreaterThanOrEqual(1);
      expect(ctors[0].qualifiedName).toBe('myapp::Processor::Processor');
    });

    it('should detect function call sites', () => {
      const result = parseCppFile(filePath, content);

      expect(result.callSites.length).toBeGreaterThan(0);
      const calleeNames = result.callSites.map(c => c.calleeName);
      // Should detect calls to push_back, sort, size, etc.
      expect(calleeNames).toContain('push_back');
    });

    it('should mark file as source (not header)', () => {
      const result = parseCppFile(filePath, content);
      expect(result.file.isHeader).toBe(false);
    });

    it('should count lines of code', () => {
      const result = parseCppFile(filePath, content);
      expect(result.file.loc).toBeGreaterThan(10);
    });
  });

  describe('edge cases', () => {
    it('should handle empty file gracefully', () => {
      const result = parseCppFile('empty.cpp', '');
      expect(result.file.symbols).toHaveLength(0);
      expect(result.file.includes).toHaveLength(0);
    });

    it('should handle file with only comments', () => {
      const content = `
// This is a comment
/* This is
   a block comment */
// Another comment
`;
      const result = parseCppFile('comments.cpp', content);
      expect(result.file.symbols).toHaveLength(0);
    });

    it('should handle malformed class declaration', () => {
      const content = `
class Incomplete;
class Complete {
public:
  void method();
};
`;
      const result = parseCppFile('malformed.h', content);
      const classes = result.file.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThanOrEqual(1);
      expect(classes.some(c => c.name === 'Complete')).toBe(true);
    });
  });
});
