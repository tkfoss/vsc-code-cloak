import * as vscode from 'vscode';
import { ConfigManager } from './config/ConfigManager';
import { DecorationManager } from './decorations/DecorationManager';
import { CommandManager } from './commands/CommandManager';
import { StatusBarManager } from './ui/StatusBarManager';
import { CloakFoldingRangeProvider } from './folding/FoldingProvider';
import { FoldingManager } from './folding/FoldingManager';

export function activate(context: vscode.ExtensionContext) {
  console.log('Code Cloak extension is now active');

  const configManager = new ConfigManager();
  const decorationManager = new DecorationManager(configManager);
  const statusBarManager = new StatusBarManager(configManager);
  const foldingManager = new FoldingManager(configManager);
  const commandManager = new CommandManager(configManager, decorationManager, statusBarManager);

  // Register folding range provider
  const foldingProvider = new CloakFoldingRangeProvider(configManager);
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      ['python', 'typescript', 'typescriptreact'],
      foldingProvider
    )
  );

  // Register all commands
  commandManager.registerCommands(context);

  // Register event handlers
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        decorationManager.updateDecorations(editor);
        // Auto-fold if configured
        if (configManager.isEnabled() && configManager.getConfig().autoHide) {
          await foldingManager.foldAll(editor);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        decorationManager.updateDecorations(editor);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('codeCloak')) {
        configManager.reloadConfig();
        decorationManager.refreshAllDecorations();
        statusBarManager.update();
      }
    })
  );

  // Initial update
  if (vscode.window.activeTextEditor) {
    decorationManager.updateDecorations(vscode.window.activeTextEditor);
    // Auto-fold if configured
    if (configManager.isEnabled() && configManager.getConfig().autoHide) {
      foldingManager.foldAll(vscode.window.activeTextEditor);
    }
  }
  statusBarManager.update();
}

export function deactivate() {
  console.log('Code Cloak extension is now deactivated');
}
