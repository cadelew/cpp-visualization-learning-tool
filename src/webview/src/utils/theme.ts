export type ThemeKind = 'light' | 'dark' | 'high-contrast';

export interface ThemeColors {
  background: string;
  foreground: string;
  border: string;
  panelBackground: string;
  buttonBackground: string;
  buttonForeground: string;
  inputBackground: string;
  inputBorder: string;
  inputForeground: string;
  accentColor: string;
}

function getCSSVariable(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function getThemeColors(): ThemeColors {
  return {
    background: getCSSVariable('--vscode-editor-background', '#1e1e1e'),
    foreground: getCSSVariable('--vscode-editor-foreground', '#d4d4d4'),
    border: getCSSVariable('--vscode-panel-border', '#454545'),
    panelBackground: getCSSVariable('--vscode-sideBar-background', '#252526'),
    buttonBackground: getCSSVariable('--vscode-button-background', '#0e639c'),
    buttonForeground: getCSSVariable('--vscode-button-foreground', '#ffffff'),
    inputBackground: getCSSVariable('--vscode-input-background', '#3c3c3c'),
    inputBorder: getCSSVariable('--vscode-input-border', '#3c3c3c'),
    inputForeground: getCSSVariable('--vscode-input-foreground', '#cccccc'),
    accentColor: getCSSVariable('--vscode-focusBorder', '#007acc'),
  };
}

export function getNodeKindColor(kind: string, themeKind: ThemeKind): string {
  const darkColors: Record<string, string> = {
    file: '#4a9eff',
    namespace: '#7c68ee',
    class: '#4ec9b0',
    struct: '#4ec9b0',
    function: '#dcdcaa',
    method: '#dcdcaa',
    thread: '#ff9944',
    mutex: '#ff4444',
    atomic: '#ff6b9d',
    condition_variable: '#c586c0',
    queue: '#9cdcfe',
    lock_guard: '#ff4444',
    subsystem: '#569cd6',
  };

  const lightColors: Record<string, string> = {
    file: '#0066cc',
    namespace: '#5c3db8',
    class: '#267f6e',
    struct: '#267f6e',
    function: '#795e26',
    method: '#795e26',
    thread: '#cc6600',
    mutex: '#cc0000',
    atomic: '#cc2266',
    condition_variable: '#8b3f8b',
    queue: '#005a9e',
    lock_guard: '#cc0000',
    subsystem: '#0451a5',
  };

  const colors = themeKind === 'light' ? lightColors : darkColors;
  return colors[kind] || (themeKind === 'light' ? '#333333' : '#d4d4d4');
}
