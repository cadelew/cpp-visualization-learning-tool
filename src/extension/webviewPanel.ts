import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../types/webview';

export class GraphWebviewPanel {
  private static instance: GraphWebviewPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private extensionUri: vscode.Uri;

  private constructor(private readonly context: vscode.ExtensionContext) {
    this.extensionUri = context.extensionUri;
  }

  static getInstance(context: vscode.ExtensionContext): GraphWebviewPanel {
    if (!GraphWebviewPanel.instance) {
      GraphWebviewPanel.instance = new GraphWebviewPanel(context);
    }
    return GraphWebviewPanel.instance;
  }

  show(options?: { concurrencyOnly?: boolean }): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      if (options?.concurrencyOnly) {
        this.postMessage({ type: 'config', payload: this.getConfig(true) });
      }
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cppVizGraph',
      'C++ Architecture Graph',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
        ],
      }
    );

    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => this.handleWebviewMessage(message),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Listen for theme changes
    vscode.window.onDidChangeActiveColorTheme(
      (theme) => {
        this.postMessage({
          type: 'theme',
          payload: { kind: this.mapThemeKind(theme.kind) },
        });
      },
      null,
      this.disposables
    );

    // Send initial config
    const currentTheme = vscode.window.activeColorTheme;
    this.postMessage({
      type: 'theme',
      payload: { kind: this.mapThemeKind(currentTheme.kind) },
    });

    if (options?.concurrencyOnly) {
      this.postMessage({ type: 'config', payload: this.getConfig(true) });
    } else {
      this.postMessage({ type: 'config', payload: this.getConfig(false) });
    }
  }

  postMessage(message: ExtensionToWebviewMessage): void {
    this.panel?.webview.postMessage(message);
  }

  private async handleWebviewMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        // Webview is ready, send initial data
        break;

      case 'navigateToSource': {
        const { file, line, col } = message.payload;
        const uri = vscode.Uri.file(file);
        const position = new vscode.Position(line - 1, col - 1);
        const range = new vscode.Range(position, position);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(position, position);
        break;
      }

      case 'requestExplanation':
        vscode.commands.executeCommand('cppViz.explainSubsystem', message.payload.subsystemId);
        break;

      case 'requestRefresh':
        vscode.commands.executeCommand('cppViz.refreshAnalysis');
        break;

      case 'exportGraph':
        vscode.window.showInformationMessage(`Export as ${message.payload.format} not yet implemented`);
        break;

      case 'selectNode':
      case 'filterGraph':
      case 'requestOnboarding':
      case 'askQuestion':
        break;
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.js')
    );

    const nonce = getNonce();

    // Try to load the HTML template
    const htmlTemplatePath = path.join(
      this.extensionUri.fsPath,
      'src',
      'webview',
      'public',
      'index.html'
    );

    if (fs.existsSync(htmlTemplatePath)) {
      let html = fs.readFileSync(htmlTemplatePath, 'utf8');
      html = html.replace(/{{nonce}}/g, nonce);
      html = html.replace(/{{scriptUri}}/g, scriptUri.toString());
      html = html.replace(/{{cspSource}}/g, webview.cspSource);
      return html;
    }

    // Fallback inline HTML
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <title>C++ Architecture Graph</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getConfig(concurrencyOnly: boolean) {
    const config = vscode.workspace.getConfiguration('cppViz');
    return {
      layout: config.get<'hierarchical' | 'force-directed' | 'radial'>('graph.defaultLayout', 'hierarchical'),
      showLabels: true,
      showEdgeLabels: false,
      showConfidence: true,
      clusterBySubsystem: true,
      highlightConcurrency: concurrencyOnly,
    };
  }

  private mapThemeKind(kind: vscode.ColorThemeKind): 'light' | 'dark' | 'high-contrast' {
    switch (kind) {
      case vscode.ColorThemeKind.Light:
        return 'light';
      case vscode.ColorThemeKind.HighContrast:
      case vscode.ColorThemeKind.HighContrastLight:
        return 'high-contrast';
      default:
        return 'dark';
    }
  }

  private dispose(): void {
    this.panel = undefined;
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    GraphWebviewPanel.instance = undefined;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
