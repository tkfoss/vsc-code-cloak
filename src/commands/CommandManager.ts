import * as vscode from 'vscode';
import { CLOAK_STYLES, CloakFeature, CloakStyle, ConfigManager } from '../config/ConfigManager';
import { DecorationManager } from '../decorations/DecorationManager';
import { StatusBarManager } from '../ui/StatusBarManager';
import { FoldingManager } from '../folding/FoldingManager';

const STYLES: readonly CloakStyle[] = CLOAK_STYLES;

const FEATURE_NAMES: Record<CloakFeature, string> = {
  secrets: 'Secrets',
  types: 'Type annotations',
  comments: 'Comments',
  docstrings: 'Docstrings',
};

/**
 * Registers every `codeCloak.*` command.
 *
 * Feedback goes to the status bar rather than notification toasts: this
 * extension is used while a screen is being shared, where a stack of popups
 * announcing what was just hidden defeats the point.
 */
export class CommandManager {
  constructor(
    private readonly configManager: ConfigManager,
    private readonly decorationManager: DecorationManager,
    private readonly statusBarManager: StatusBarManager,
    private readonly foldingManager: FoldingManager
  ) {}

  public registerCommands(context: vscode.ExtensionContext): void {
    const commands: Record<string, () => Promise<void> | void> = {
      'codeCloak.enable': () => this.setEnabled(true),
      'codeCloak.disable': () => this.setEnabled(false),
      'codeCloak.toggle': () => this.setEnabled(!this.configManager.isEnabled()),
      'codeCloak.showQuickPick': () => this.showQuickPickMenu(),
      'codeCloak.toggleSecrets': () => this.toggleFeature('secrets'),
      'codeCloak.toggleTypes': () => this.toggleFeature('types'),
      'codeCloak.toggleComments': () => this.toggleFeature('comments'),
      'codeCloak.toggleDocstrings': () => this.toggleFeature('docstrings'),
      'codeCloak.hideSecrets': () => this.setHidden('secrets', true),
      'codeCloak.showSecrets': () => this.setHidden('secrets', false),
      'codeCloak.hideTypes': () => this.setHidden('types', true),
      'codeCloak.showTypes': () => this.setHidden('types', false),
      'codeCloak.hideComments': () => this.setHidden('comments', true),
      'codeCloak.showComments': () => this.setHidden('comments', false),
      'codeCloak.hideDocstrings': () => this.setHidden('docstrings', true),
      'codeCloak.showDocstrings': () => this.setHidden('docstrings', false),
      'codeCloak.toggleFolding': () => this.setFolding(!this.configManager.isFoldingEnabled()),
      'codeCloak.foldCloaked': () => this.foldCloaked(),
      'codeCloak.unfoldCloaked': () => this.unfoldCloaked(),
      'codeCloak.toggleCurrentLine': () => this.toggleCurrentLine(),
      'codeCloak.addToExcludeList': () => this.addToExcludeList(),
      'codeCloak.excludeFile': () => this.excludeFile(),
      'codeCloak.includeFile': () => this.includeFile(),
      'codeCloak.changeStyle': () => this.changeStyle(),
    };

    for (const [id, handler] of Object.entries(commands)) {
      context.subscriptions.push(vscode.commands.registerCommand(id, handler));
    }
  }

  private async setEnabled(enabled: boolean): Promise<void> {
    await this.configManager.setEnabled(enabled);
    this.decorationManager.clearRevealedLines();
    await this.refresh({ unfold: !enabled });
    this.report(`Code Cloak ${enabled ? 'enabled' : 'disabled'}`);
  }

  private toggleFeature(feature: CloakFeature): Promise<void> {
    return this.setHidden(feature, !this.configManager.isHidden(feature));
  }

  private async setHidden(feature: CloakFeature, hidden: boolean): Promise<void> {
    if (!this.configManager.isFeatureEnabled(feature)) {
      vscode.window.showWarningMessage(
        `${FEATURE_NAMES[feature]} hiding is turned off. Enable "codeCloak.features.${feature}" first.`
      );
      return;
    }

    this.configManager.setHidden(feature, hidden);
    if (hidden) {
      this.decorationManager.clearRevealedLines();
    }
    // Revealing has to unfold first: folds are collapsed regions, and only a
    // fresh unfold-then-fold pass leaves the still-hidden features collapsed.
    await this.refresh({ unfold: !hidden });
    this.report(`${FEATURE_NAMES[feature]} ${hidden ? 'hidden' : 'revealed'}`);
  }

  /**
   * Turning folding off reopens what the cloak folded before the setting is
   * written, so the manager still knows which regions were its own to reopen.
   */
  private async setFolding(enabled: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!enabled && editor) {
      await this.foldingManager.unfoldAll(editor);
    }

    await this.configManager.setFoldingEnabled(enabled);
    await this.refresh();
    this.report(`Folding ${enabled ? 'on' : 'off'}`);
  }

  private async foldCloaked(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    if (!this.configManager.isFoldingEnabled()) {
      vscode.window.showWarningMessage(
        'Code Cloak folding is turned off. Enable "codeCloak.folding.enabled" first.'
      );
      return;
    }

    await this.foldingManager.foldAll(editor);
    this.report('Cloaked regions folded');
  }

  private async unfoldCloaked(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    await this.foldingManager.unfoldAll(editor);
    this.report('Cloaked regions unfolded');
  }

  private toggleCurrentLine(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const lines = new Set<number>();
    for (const selection of editor.selections) {
      for (let line = selection.start.line; line <= selection.end.line; line++) {
        lines.add(line);
      }
    }

    this.decorationManager.toggleLines(editor, [...lines]);
  }

  private async addToExcludeList(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const selected = editor.document.getText(editor.selection).trim();
    const key =
      selected || this.decorationManager.secretKeyAt(editor.document, editor.selection.active);

    if (!key) {
      vscode.window.showWarningMessage(
        'No key found on this line. Select the key name to exclude it.'
      );
      return;
    }

    await this.configManager.addExcludedKey(key);
    await this.refresh();
    this.report(`"${key}" will no longer be hidden`);
  }

  private async excludeFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    await this.configManager.excludeFile(editor.document.fileName);
    await this.refresh({ unfold: true });
    this.report('File excluded from Code Cloak');
  }

  private async includeFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    await this.configManager.includeFile(editor.document.fileName);
    await this.refresh();
    this.report('File included in Code Cloak');
  }

  private async changeStyle(): Promise<void> {
    const current = this.configManager.getConfig().appearance.style;
    const selected = await vscode.window.showQuickPick(
      STYLES.map((style) => ({
        label: style,
        description: style === current ? 'current' : undefined,
      })),
      { placeHolder: 'Select hiding style' }
    );

    if (selected) {
      await this.configManager.setStyle(selected.label as CloakStyle);
      await this.refresh();
      this.report(`Hiding style: ${selected.label}`);
    }
  }

  private async showQuickPickMenu(): Promise<void> {
    interface ActionItem extends vscode.QuickPickItem {
      action?: () => Promise<void> | void;
    }

    const enabled = this.configManager.isEnabled();
    const folding = this.configManager.isFoldingEnabled();
    const separator: ActionItem = { label: '', kind: vscode.QuickPickItemKind.Separator };

    const items: ActionItem[] = [
      {
        label: `$(${enabled ? 'eye' : 'eye-closed'}) ${enabled ? 'Disable' : 'Enable'} Code Cloak`,
        description: enabled ? 'Turn off all cloaking' : 'Turn on cloaking',
        action: () => this.setEnabled(!enabled),
      },
      separator,
      ...(Object.keys(FEATURE_NAMES) as CloakFeature[]).map((feature) => {
        const hidden = this.configManager.isHidden(feature);
        const available = this.configManager.isFeatureEnabled(feature);
        return {
          label: `$(${hidden ? 'eye' : 'eye-closed'}) ${hidden ? 'Show' : 'Hide'} ${FEATURE_NAMES[feature]}`,
          description: available ? undefined : 'feature disabled in settings',
          action: () => this.setHidden(feature, !hidden),
        };
      }),
      separator,
      {
        label: `$(fold${folding ? '-up' : '-down'}) Turn Folding ${folding ? 'Off' : 'On'}`,
        description: folding
          ? 'stop collapsing cloaked comments and docstrings'
          : 'collapse cloaked comments and docstrings',
        action: () => this.setFolding(!folding),
      },
      {
        label: '$(paintcan) Change Style',
        description: `currently: ${this.configManager.getConfig().appearance.style}`,
        action: () => this.changeStyle(),
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Code Cloak',
      matchOnDescription: true,
    });
    await selected?.action?.();
  }

  /** Re-renders decorations, folds and the status bar after any state change. */
  private async refresh(options: { unfold?: boolean } = {}): Promise<void> {
    this.decorationManager.refreshAllDecorations();
    this.statusBarManager.update();

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    if (options.unfold) {
      await this.foldingManager.unfoldAll(editor);
    }
    if (this.configManager.isEnabled()) {
      await this.foldingManager.foldAll(editor);
    }
  }

  private report(message: string): void {
    vscode.window.setStatusBarMessage(`$(eye-closed) ${message}`, 3000);
  }
}
