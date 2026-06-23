import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  console.log('C++ Visualizer extension activated');

  // Commands will be registered by feature modules
  // This is a placeholder for the extension entry point

  const showArchitecture = vscode.commands.registerCommand(
    'cppViz.showArchitectureGraph',
    () => {
      vscode.window.showInformationMessage('C++ Viz: Architecture Graph (loading...)');
    }
  );

  const showConcurrency = vscode.commands.registerCommand(
    'cppViz.showConcurrencyGraph',
    () => {
      vscode.window.showInformationMessage('C++ Viz: Concurrency Graph (loading...)');
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
