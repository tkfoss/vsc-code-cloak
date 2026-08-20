import * as vscode from 'vscode';
import { CloakFeature, ConfigManager } from '../config/ConfigManager';

const FEATURE_LABELS: Array<[CloakFeature, string]> = [
  ['secrets', 'Secrets'],
  ['types', 'Types'],
  ['comments', 'Comments'],
  ['docstrings', 'Docstrings'],
];

/**
 * Status bar entry reporting what is currently hidden.
 *
 * The warning background is deliberate: while content is cloaked the editor is
 * not showing the whole truth, and that needs to be obvious at a glance rather
 * than something the user has to remember.
 */
export class StatusBarManager {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(private readonly configManager: ConfigManager) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.name = 'Code Cloak';
    this.statusBarItem.command = 'codeCloak.showQuickPick';
    this.statusBarItem.show();
  }

  public update(): void {
    const enabled = this.configManager.isEnabled();
    const active = FEATURE_LABELS.filter(([feature]) => this.configManager.isHidden(feature)).map(
      ([, label]) => label
    );

    this.statusBarItem.text = `${enabled ? '$(eye-closed)' : '$(eye)'} Cloak: ${enabled ? 'On' : 'Off'}`;

    if (!enabled) {
      this.statusBarItem.tooltip = 'Code Cloak is off\nClick for options';
      this.statusBarItem.backgroundColor = undefined;
    } else if (active.length === 0) {
      this.statusBarItem.tooltip = 'Code Cloak is on but nothing is hidden\nClick for options';
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.tooltip = `Hiding: ${active.join(', ')}\nClick for options`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    this.statusBarItem.accessibilityInformation = { label: this.statusBarItem.tooltip };
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
