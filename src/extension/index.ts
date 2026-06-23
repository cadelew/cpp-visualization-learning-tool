import * as vscode from 'vscode';
import { GraphWebviewPanel } from './webviewPanel';

export function activate(context: vscode.ExtensionContext): void {
  console.log('C++ Visualizer extension activated');

  const panelManager = GraphWebviewPanel.getInstance(context);

  const showArchitecture = vscode.commands.registerCommand(
    'cppViz.showArchitectureGraph',
    () => {
      panelManager.show();
    }
  );

  const showConcurrency = vscode.commands.registerCommand(
    'cppViz.showConcurrencyGraph',
    () => {
      panelManager.show({ concurrencyOnly: true });
    }
  );

  const analyzeWorkspace = vscode.commands.registerCommand(
    'cppViz.analyzeWorkspace',
    () => {
      vscode.window.showInformationMessage('C++ Viz: Analyzing workspace...');
    }
  );

  const explainSubsystem = vscode.commands.registerCommand(
    'cppViz.explainSubsystem',
    () => {
      vscode.window.showInformationMessage('C++ Viz: Explain Subsystem (loading...)');
    }
  );

  const startHereGuide = vscode.commands.registerCommand(
    'cppViz.startHereGuide',
    () => {
      vscode.window.showInformationMessage('C++ Viz: Start Here Guide (loading...)');
    }
  );

  const refreshAnalysis = vscode.commands.registerCommand(
    'cppViz.refreshAnalysis',
    () => {
      panelManager.postMessage({
        type: 'analysisProgress',
        payload: { phase: 'refresh', percent: 0, message: 'Refreshing analysis...' },
      });
      vscode.window.showInformationMessage('C++ Viz: Refreshing analysis...');
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
