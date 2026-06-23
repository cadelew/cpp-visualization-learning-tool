import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GraphWebviewPanel } from './webviewPanel';
import { analyzeWorkspace as runWorkspaceAnalysis } from '../analysis/manager';
import { analyzeConcurrency } from '../analysis/concurrency';
import { LLMClient } from '../llm/client';
import { generateExplanation } from '../llm/explanationGenerator';
import { generateOnboardingGuide } from '../llm/onboardingGenerator';
import { answerQuestion } from '../llm/qaHandler';
import { CodebaseGraph, AnalysisResult } from '../types/graph';
import { AnalysisConfig } from '../types/analysis';
import { LLMConfig } from '../types/llm';
import { WebviewToExtensionMessage } from '../types/webview';

let currentAnalysis: AnalysisResult | undefined;
let currentSourceFiles: Map<string, string> | undefined;

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders?.[0]?.uri.fsPath;
}

function getAnalysisConfig(workspaceRoot: string): AnalysisConfig {
  const config = vscode.workspace.getConfiguration('cppViz');
  return {
    workspaceRoot,
    compileCommandsPath: config.get<string>('compileCommandsPath') || undefined,
    excludePatterns: config.get<string[]>('analysis.excludePatterns', [
      '**/build/**', '**/node_modules/**', '**/third_party/**', '**/.git/**',
    ]),
    maxFileSize: config.get<number>('analysis.maxFileSize', 1048576),
    useTreeSitterFallback: true,
  };
}

function getLLMConfig(): LLMConfig {
  const config = vscode.workspace.getConfiguration('cppViz');
  return {
    provider: config.get<'none' | 'openai' | 'anthropic'>('llm.provider', 'none'),
    apiKey: config.get<string>('llm.apiKey', ''),
    model: config.get<string>('llm.model', 'gpt-4o-mini'),
    maxTokens: 4096,
    temperature: 0.3,
  };
}

function loadSourceFiles(workspaceRoot: string, filePaths: string[]): Map<string, string> {
  const sources = new Map<string, string>();
  for (const fp of filePaths) {
    const fullPath = path.isAbsolute(fp) ? fp : path.join(workspaceRoot, fp);
    try {
      sources.set(fp, fs.readFileSync(fullPath, 'utf-8'));
    } catch {
      // skip unreadable files
    }
  }
  return sources;
}

async function runAnalysis(
  panel: GraphWebviewPanel,
  workspaceRoot: string
): Promise<void> {
  const analysisConfig = getAnalysisConfig(workspaceRoot);

  panel.postMessage({
    type: 'analysisProgress',
    payload: { phase: 'scanning', percent: 10, message: 'Scanning workspace for C++ files...' },
  });

  try {
    const result = await runWorkspaceAnalysis(analysisConfig);
    currentAnalysis = result;

    panel.postMessage({
      type: 'analysisProgress',
      payload: { phase: 'concurrency', percent: 60, message: 'Detecting concurrency patterns...' },
    });

    // Load source files for concurrency analysis
    const filePaths = result.graph.nodes
      .filter((n: { kind: string; location?: { file: string } }) => n.kind === 'file' && n.location?.file)
      .map((n: { location?: { file: string } }) => n.location!.file);
    currentSourceFiles = loadSourceFiles(workspaceRoot, filePaths);

    const filesForConcurrency = Array.from(currentSourceFiles.entries()).map(
      ([filePath, content]) => ({ path: filePath, content })
    );
    const concurrencyResult = await analyzeConcurrency(filesForConcurrency, result.graph);

    // Merge concurrency nodes/edges into main graph
    const mergedGraph: CodebaseGraph = {
      ...result.graph,
      nodes: [...result.graph.nodes, ...concurrencyResult.nodes],
      edges: [...result.graph.edges, ...concurrencyResult.edges],
    };

    panel.postMessage({
      type: 'analysisProgress',
      payload: { phase: 'rendering', percent: 90, message: 'Preparing visualization...' },
    });

    // Send data to webview
    panel.postMessage({ type: 'graphData', payload: mergedGraph });
    panel.postMessage({ type: 'subsystems', payload: result.subsystems });
    panel.postMessage({ type: 'concurrencyData', payload: concurrencyResult.analysis });

    panel.postMessage({
      type: 'analysisProgress',
      payload: { phase: 'done', percent: 100, message: `Analysis complete: ${result.graph.nodes.length} symbols, ${concurrencyResult.analysis.threads.length} threads, ${concurrencyResult.analysis.mutexes.length} mutexes` },
    });

    if (result.errors.length > 0) {
      vscode.window.showWarningMessage(
        `C++ Viz: Analysis completed with ${result.errors.length} warning(s)`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    panel.postMessage({
      type: 'analysisError',
      payload: { message: `Analysis failed: ${message}` },
    });
    vscode.window.showErrorMessage(`C++ Viz: Analysis failed — ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('C++ Visualizer extension activated');

  const panelManager = GraphWebviewPanel.getInstance(context);

  // Override webview message handler to wire up analysis + LLM
  panelManager.setMessageHandler(async (message: WebviewToExtensionMessage) => {
    switch (message.type) {
      case 'ready': {
        const workspaceRoot = getWorkspaceRoot();
        if (workspaceRoot) {
          await runAnalysis(panelManager, workspaceRoot);
        } else {
          panelManager.postMessage({
            type: 'analysisError',
            payload: { message: 'No workspace folder open. Please open a C++ project.' },
          });
        }
        break;
      }

      case 'requestExplanation': {
        const llmConfig = getLLMConfig();
        if (llmConfig.provider === 'none' || !llmConfig.apiKey) {
          vscode.window.showWarningMessage(
            'C++ Viz: Configure an LLM provider and API key in settings to use explanations.'
          );
          return;
        }
        if (!currentAnalysis || !currentSourceFiles) {
          vscode.window.showWarningMessage('C++ Viz: Run analysis first.');
          return;
        }
        const subsystem = currentAnalysis.subsystems.find(
          s => s.id === message.payload.subsystemId
        );
        if (!subsystem) return;

        try {
          const client = new LLMClient(llmConfig);
          const explanation = await generateExplanation(
            client, subsystem, currentAnalysis.graph, currentSourceFiles
          );
          panelManager.postMessage({ type: 'explanation', payload: explanation });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`C++ Viz: Explanation failed — ${errMsg}`);
        }
        break;
      }

      case 'requestOnboarding': {
        const llmConfig2 = getLLMConfig();
        if (llmConfig2.provider === 'none' || !llmConfig2.apiKey) {
          vscode.window.showWarningMessage(
            'C++ Viz: Configure an LLM provider and API key in settings for onboarding guide.'
          );
          return;
        }
        if (!currentAnalysis || !currentSourceFiles) {
          vscode.window.showWarningMessage('C++ Viz: Run analysis first.');
          return;
        }
        try {
          const client = new LLMClient(llmConfig2);
          const guide = await generateOnboardingGuide(
            client, currentAnalysis.graph, currentAnalysis.subsystems, currentSourceFiles
          );
          panelManager.postMessage({ type: 'onboardingGuide', payload: guide });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`C++ Viz: Onboarding guide failed — ${errMsg}`);
        }
        break;
      }

      case 'askQuestion': {
        const llmConfig3 = getLLMConfig();
        if (llmConfig3.provider === 'none' || !llmConfig3.apiKey) {
          vscode.window.showWarningMessage(
            'C++ Viz: Configure an LLM provider and API key in settings for Q&A.'
          );
          return;
        }
        if (!currentAnalysis || !currentSourceFiles) {
          vscode.window.showWarningMessage('C++ Viz: Run analysis first.');
          return;
        }
        try {
          const client = new LLMClient(llmConfig3);
          const answer = await answerQuestion(
            client,
            { question: message.payload.question, context: { selectedSymbol: message.payload.context?.nodeId } },
            currentAnalysis.graph,
            currentSourceFiles
          );
          panelManager.postMessage({ type: 'answer', payload: answer });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`C++ Viz: Q&A failed — ${errMsg}`);
        }
        break;
      }

      case 'requestRefresh': {
        const workspaceRoot = getWorkspaceRoot();
        if (workspaceRoot) {
          await runAnalysis(panelManager, workspaceRoot);
        }
        break;
      }

      case 'navigateToSource': {
        const { file, line, col } = message.payload;
        const workspaceRoot = getWorkspaceRoot();
        const fullPath = path.isAbsolute(file)
          ? file
          : path.join(workspaceRoot || '', file);
        const uri = vscode.Uri.file(fullPath);
        const position = new vscode.Position(line - 1, col - 1);
        const range = new vscode.Range(position, position);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(position, position);
        break;
      }

      case 'exportGraph': {
        if (!currentAnalysis) {
          vscode.window.showWarningMessage('C++ Viz: No analysis data to export.');
          return;
        }
        if (message.payload.format === 'json') {
          const uri = await vscode.window.showSaveDialog({
            filters: { 'JSON': ['json'] },
            defaultUri: vscode.Uri.file('codebase-graph.json'),
          });
          if (uri) {
            fs.writeFileSync(uri.fsPath, JSON.stringify(currentAnalysis.graph, null, 2));
            vscode.window.showInformationMessage(`Graph exported to ${uri.fsPath}`);
          }
        } else {
          vscode.window.showInformationMessage(`Export as ${message.payload.format} not yet implemented`);
        }
        break;
      }

      case 'selectNode':
      case 'filterGraph':
        break;
    }
  });

  const showArchitecture = vscode.commands.registerCommand(
    'cppViz.showArchitectureGraph',
    () => panelManager.show()
  );

  const showConcurrency = vscode.commands.registerCommand(
    'cppViz.showConcurrencyGraph',
    () => panelManager.show({ concurrencyOnly: true })
  );

  const analyzeWorkspace = vscode.commands.registerCommand(
    'cppViz.analyzeWorkspace',
    async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }
      panelManager.show();
    }
  );

  const explainSubsystem = vscode.commands.registerCommand(
    'cppViz.explainSubsystem',
    async () => {
      if (!currentAnalysis) {
        vscode.window.showWarningMessage('C++ Viz: Run analysis first.');
        return;
      }
      const items = currentAnalysis.subsystems.map(s => ({
        label: s.name,
        description: s.description || `${s.nodeIds.length} symbols`,
        subsystemId: s.id,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a subsystem to explain',
      });
      if (picked) {
        panelManager.postMessage({
          type: 'analysisProgress',
          payload: { phase: 'explaining', percent: 50, message: `Generating explanation for ${picked.label}...` },
        });
        // Trigger via webview message handler
        panelManager.handleExternalMessage({
          type: 'requestExplanation',
          payload: { subsystemId: picked.subsystemId },
        });
      }
    }
  );

  const startHereGuide = vscode.commands.registerCommand(
    'cppViz.startHereGuide',
    () => {
      panelManager.show();
      panelManager.handleExternalMessage({
        type: 'requestOnboarding',
        payload: {},
      });
    }
  );

  const refreshAnalysis = vscode.commands.registerCommand(
    'cppViz.refreshAnalysis',
    () => {
      panelManager.handleExternalMessage({
        type: 'requestRefresh',
        payload: {},
      });
    }
  );

  context.subscriptions.push(
    showArchitecture,
    showConcurrency,
    analyzeWorkspace,
    explainSubsystem,
    startHereGuide,
    refreshAnalysis,
  );
}

export function deactivate(): void {
  console.log('C++ Visualizer extension deactivated');
}
