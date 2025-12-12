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

    const icon = enabled ? '$(eye-closed)' : '$(eye)';
    const status = enabled ? 'On' : 'Off';
    this.statusBarItem.text = `${icon} Cloak: ${status}`;

    if (!enabled) {
      this.statusBarItem.tooltip = 'Click to toggle Code Cloak';
      this.statusBarItem.backgroundColor = undefined;
    } else if (activeFeatures.length === 0) {
      this.statusBarItem.tooltip = 'Code Cloak is enabled but no features are active\nClick to toggle';
      this.statusBarItem.backgroundColor = undefined;
    } else {
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
