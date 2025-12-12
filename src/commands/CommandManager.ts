import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { DecorationManager } from '../decorations/DecorationManager';
import { StatusBarManager } from '../ui/StatusBarManager';
import { FoldingManager } from '../folding/FoldingManager';

export class CommandManager {
  private foldingManager: FoldingManager;

  constructor(
    private configManager: ConfigManager,
    private decorationManager: DecorationManager,
    private statusBarManager: StatusBarManager
  ) {
    this.foldingManager = new FoldingManager(configManager);
  }

  public registerCommands(context: vscode.ExtensionContext): void {
    // Main toggle commands
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.enable', async () => await this.enableExtension())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.disable', async () => await this.disableExtension())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.toggle', async () => await this.toggleExtension())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.showQuickPick', async () => await this.showQuickPickMenu())
    );

    // Feature-specific commands
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.hideSecrets', () => this.hideSecrets())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.showSecrets', () => this.showSecrets())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.hideTypes', () => this.hideTypes())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.showTypes', () => this.showTypes())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.hideComments', async () => await this.hideComments())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.showComments', async () => await this.showComments())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.hideDocstrings', async () => await this.hideDocstrings())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.showDocstrings', async () => await this.showDocstrings())
    );

    // File and selection commands
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.toggleCurrentLine', () =>
        this.toggleCurrentLine()
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.addToExcludeList', () =>
        this.addToExcludeList()
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.excludeFile', () => this.excludeFile())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.includeFile', () => this.includeFile())
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('codeCloak.changeStyle', () => this.changeStyle())
    );
  }

  private async enableExtension(): Promise<void> {
    await this.configManager.setEnabled(true);
    this.decorationManager.refreshAllDecorations();
    this.statusBarManager.update();

    // Auto-fold if configured
    const editor = vscode.window.activeTextEditor;
    if (editor && this.configManager.getConfig().autoHide) {
      await this.foldingManager.foldAll(editor);
    }

    vscode.window.showInformationMessage('Code Cloak enabled');
  }

  private async disableExtension(): Promise<void> {
    await this.configManager.setEnabled(false);
    this.decorationManager.refreshAllDecorations();
    this.statusBarManager.update();

    // Unfold everything when disabling
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.foldingManager.unfoldAll(editor);
    }

    vscode.window.showInformationMessage('Code Cloak disabled');
  }

  private async toggleExtension(): Promise<void> {
    const enabled = !this.configManager.isEnabled();
    await this.configManager.setEnabled(enabled);
    this.decorationManager.refreshAllDecorations();
    this.statusBarManager.update();

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      if (enabled && this.configManager.getConfig().autoHide) {
        await this.foldingManager.foldAll(editor);
      } else if (!enabled) {
        await this.foldingManager.unfoldAll(editor);
      }
    }

    vscode.window.showInformationMessage(`Code Cloak ${enabled ? 'enabled' : 'disabled'}`);
  }

  private hideSecrets(): void {
    this.configManager.setSecretsHidden(true);
    this.refreshDecorations();
    vscode.window.showInformationMessage('Secrets hidden');
  }

  private showSecrets(): void {
    this.configManager.setSecretsHidden(false);
    this.refreshDecorations();
    vscode.window.showInformationMessage('Secrets revealed');
  }

  private hideTypes(): void {
    this.configManager.setTypesHidden(true);
    this.refreshDecorations();
    vscode.window.showInformationMessage('Type annotations hidden');
  }

  private showTypes(): void {
    this.configManager.setTypesHidden(false);
    this.refreshDecorations();
    vscode.window.showInformationMessage('Type annotations revealed');
  }

  private async hideComments(): Promise<void> {
    this.configManager.setCommentsHidden(true);
    this.refreshDecorations();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.foldingManager.foldAll(editor);
    }
    vscode.window.showInformationMessage('Comments hidden');
  }

  private async showComments(): Promise<void> {
    this.configManager.setCommentsHidden(false);
    this.refreshDecorations();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.foldingManager.unfoldAll(editor);
    }
    vscode.window.showInformationMessage('Comments revealed');
  }

  private async hideDocstrings(): Promise<void> {
    this.configManager.setDocstringsHidden(true);
    this.refreshDecorations();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.foldingManager.foldAll(editor);
    }
    vscode.window.showInformationMessage('Docstrings hidden');
  }

  private async showDocstrings(): Promise<void> {
    this.configManager.setDocstringsHidden(false);
    this.refreshDecorations();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.foldingManager.unfoldAll(editor);
    }
    vscode.window.showInformationMessage('Docstrings revealed');
  }

  private async toggleCurrentLine(): Promise<void> {
    vscode.window.showInformationMessage('Toggle current line - Coming soon!');
  }

  private async addToExcludeList(): Promise<void> {
    vscode.window.showInformationMessage('Add to exclude list - Coming soon!');
  }

  private async excludeFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const filePath = editor.document.fileName;
    await this.configManager.excludeFile(filePath);
    this.decorationManager.refreshAllDecorations();
    vscode.window.showInformationMessage(`File excluded: ${filePath}`);
  }

  private async includeFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const filePath = editor.document.fileName;
    await this.configManager.includeFile(filePath);
    this.decorationManager.refreshAllDecorations();
    vscode.window.showInformationMessage(`File included: ${filePath}`);
  }

  private async changeStyle(): Promise<void> {
    const styles = ['text', 'dots', 'stars', 'scramble', 'blur', 'block'];
    const selected = await vscode.window.showQuickPick(styles, {
      placeHolder: 'Select hiding style',
    });

    if (selected) {
      await vscode.workspace
        .getConfiguration('codeCloak')
        .update('appearance.style', selected, vscode.ConfigurationTarget.Global);
      this.configManager.reloadConfig();
      this.decorationManager.refreshAllDecorations();
      vscode.window.showInformationMessage(`Hiding style changed to: ${selected}`);
    }
  }

  private refreshDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.decorationManager.updateDecorations(editor);
    }
  }

  private async showQuickPickMenu(): Promise<void> {
    const enabled = this.configManager.isEnabled();
    const secretsHidden = this.configManager.isSecretsHidden();
    const typesHidden = this.configManager.isTypesHidden();
    const commentsHidden = this.configManager.isCommentsHidden();
    const docstringsHidden = this.configManager.isDocstringsHidden();

    interface QuickPickItemWithAction extends vscode.QuickPickItem {
      action: () => Promise<void>;
    }

    const items: QuickPickItemWithAction[] = [
      {
        label: `$(${enabled ? 'eye' : 'eye-closed'}) ${enabled ? 'Disable' : 'Enable'} Code Cloak`,
        description: enabled ? 'Turn off all cloaking' : 'Turn on cloaking',
        action: async () => enabled ? await this.disableExtension() : await this.enableExtension()
      },
      {
        label: '',
        description: '',
        kind: vscode.QuickPickItemKind.Separator,
        action: async () => {}
      },
      {
        label: `$(${secretsHidden ? 'eye' : 'eye-closed'}) ${secretsHidden ? 'Show' : 'Hide'} Secrets`,
        description: secretsHidden ? 'Reveal API keys and tokens' : 'Hide API keys and tokens',
        action: async () => secretsHidden ? this.showSecrets() : this.hideSecrets()
      },
      {
        label: `$(${typesHidden ? 'eye' : 'eye-closed'}) ${typesHidden ? 'Show' : 'Hide'} Type Annotations`,
        description: secretsHidden ? 'Reveal type hints' : 'Hide type hints',
        action: async () => typesHidden ? this.showTypes() : this.hideTypes()
      },
      {
        label: `$(${commentsHidden ? 'eye' : 'eye-closed'}) ${commentsHidden ? 'Show' : 'Hide'} Comments`,
        description: commentsHidden ? 'Reveal comments' : 'Hide comments',
        action: async () => commentsHidden ? await this.showComments() : await this.hideComments()
      },
      {
        label: `$(${docstringsHidden ? 'eye' : 'eye-closed'}) ${docstringsHidden ? 'Show' : 'Hide'} Docstrings`,
        description: docstringsHidden ? 'Reveal docstrings' : 'Hide docstrings',
        action: async () => docstringsHidden ? await this.showDocstrings() : await this.hideDocstrings()
      },
      {
        label: '',
        description: '',
        kind: vscode.QuickPickItemKind.Separator,
        action: async () => {}
      },
      {
        label: '$(paintcan) Change Style',
        description: 'Change the cloaking visual style',
        action: async () => await this.changeStyle()
      }
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Code Cloak Settings',
      matchOnDescription: true
    });

    if (selected) {
      await selected.action();
    }
  }
}
