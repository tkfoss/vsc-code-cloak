import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor(private configManager: ConfigManager) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'codeCloak.toggle';
    this.statusBarItem.show();
  }

  public update(): void {
    const enabled = this.configManager.isEnabled();
    const secretsHidden = this.configManager.isSecretsHidden();
    const typesHidden = this.configManager.isTypesHidden();
    const commentsHidden = this.configManager.isCommentsHidden();
    const docstringsHidden = this.configManager.isDocstringsHidden();

    if (!enabled) {
      this.statusBarItem.text = '$(eye) Code Cloak: Off';
      this.statusBarItem.tooltip = 'Click to enable Code Cloak';
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    const activeFeatures: string[] = [];
    if (secretsHidden) {
      activeFeatures.push('Secrets');
    }
    if (typesHidden) {
      activeFeatures.push('Types');
    }
    if (commentsHidden) {
      activeFeatures.push('Comments');
    }
    if (docstringsHidden) {
      activeFeatures.push('Docstrings');
    }

    if (activeFeatures.length === 0) {
      this.statusBarItem.text = '$(eye-closed) Code Cloak: Ready';
      this.statusBarItem.tooltip = 'Code Cloak is enabled but no features are active';
    } else {
      this.statusBarItem.text = `$(eye-closed) Code Cloak: ${activeFeatures.join(', ')}`;
      this.statusBarItem.tooltip = `Hiding: ${activeFeatures.join(', ')}\nClick to toggle`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    }
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
