import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseCppFile, resetIdCounter } from '../../src/analysis/parser';
import { buildIndex } from '../../src/analysis/indexer';
import { buildGraph, resetEdgeCounter } from '../../src/analysis/graphBuilder';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

describe('Graph Builder', () => {
  beforeEach(() => {
    resetIdCounter();
    resetEdgeCounter();
  });

  function parseFixtures() {
    const headerPath = path.join(FIXTURES_DIR, 'sample.h');
    const sourcePath = path.join(FIXTURES_DIR, 'sample.cpp');
    const headerContent = fs.readFileSync(headerPath, 'utf-8');
    const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

    const parsedHeader = parseCppFile(headerPath, headerContent);
    const parsedSource = parseCppFile(sourcePath, sourceContent);

    return [parsedHeader, parsedSource];
  }

  describe('buildGraph from parsed fixtures', () => {
    it('should produce nodes and edges', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      expect(result.graph.nodes.length).toBeGreaterThan(0);
      expect(result.graph.edges.length).toBeGreaterThan(0);
    });

    it('should create file nodes', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      const fileNodes = result.graph.nodes.filter(n => n.kind === 'file');
      expect(fileNodes.length).toBe(2);
      expect(fileNodes.map(n => n.label)).toContain('sample.h');
      expect(fileNodes.map(n => n.label)).toContain('sample.cpp');
    });

    it('should create class nodes', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      const classNodes = result.graph.nodes.filter(n => n.kind === 'class');
      expect(classNodes.length).toBeGreaterThanOrEqual(2);
      expect(classNodes.map(n => n.label)).toContain('Base');
      expect(classNodes.map(n => n.label)).toContain('Processor');
    });

    it('should create struct nodes', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      const structNodes = result.graph.nodes.filter(n => n.kind === 'struct');
      expect(structNodes.length).toBeGreaterThanOrEqual(1);
      expect(structNodes.map(n => n.label)).toContain('Config');
    });

    it('should create namespace nodes', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      const nsNodes = result.graph.nodes.filter(n => n.kind === 'namespace');
      expect(nsNodes.length).toBeGreaterThanOrEqual(1);
      expect(nsNodes.map(n => n.label)).toContain('myapp');
    });

    it('should create method nodes', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      const methodNodes = result.graph.nodes.filter(n => n.kind === 'method');
      expect(methodNodes.length).toBeGreaterThan(0);
      expect(methodNodes.map(n => n.label)).toContain('process');
    });

    it('should create include edges between files', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      const includeEdges = result.graph.edges.filter(e => e.kind === 'includes');
      expect(includeEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('should create inheritance edges', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      const inheritEdges = result.graph.edges.filter(e => e.kind === 'inherits');
      expect(inheritEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('should create contains edges', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      const containsEdges = result.graph.edges.filter(e => e.kind === 'contains');
      expect(containsEdges.length).toBeGreaterThan(0);
    });

    it('should assign confidence scores to edges', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      for (const edge of result.graph.edges) {
        expect(edge.confidence).toBeGreaterThanOrEqual(0);
        expect(edge.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include evidence on edges', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      for (const edge of result.graph.edges) {
        expect(edge.evidence.length).toBeGreaterThan(0);
        expect(edge.evidence[0].type).toBeDefined();
      }
    });

    it('should detect subsystems', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      expect(result.subsystems.length).toBeGreaterThan(0);
    });

    it('should assign clusters to nodes', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      const fileNodes = result.graph.nodes.filter(n => n.kind === 'file');
      for (const node of fileNodes) {
        expect(node.cluster).toBeDefined();
      }
    });

    it('should set graph version', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      expect(result.graph.version).toBe('1.0.0');
    });

    it('should set workspace root', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      expect(result.graph.workspace.root).toBe(FIXTURES_DIR);
    });

    it('should report no errors for valid fixtures', () => {
      const parsed = parseFixtures();
      const index = buildIndex(parsed, FIXTURES_DIR);
      const result = buildGraph(index, FIXTURES_DIR);

      expect(result.errors).toHaveLength(0);
    });
  });
});
