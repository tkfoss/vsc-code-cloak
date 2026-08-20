import * as vscode from 'vscode';
import { ConfigManager } from './config/ConfigManager';
import { DecorationManager } from './decorations/DecorationManager';
import { CommandManager } from './commands/CommandManager';
import { StatusBarManager } from './ui/StatusBarManager';
import { CloakFoldingRangeProvider } from './folding/FoldingProvider';
import { FoldingManager } from './folding/FoldingManager';

/**
 * Re-parsing on every keystroke is wasteful on large files -- the TypeScript
 * parser builds a full AST -- so edits are coalesced. Short enough that the
 * cloak reappears before a value is readable in a recording.
 */
const REDRAW_DELAY_MS = 120;

export function activate(context: vscode.ExtensionContext): void {
  const configManager = new ConfigManager();
  const decorationManager = new DecorationManager(configManager);
  const statusBarManager = new StatusBarManager(configManager);
  const foldingProvider = new CloakFoldingRangeProvider(configManager);
  const foldingManager = new FoldingManager(configManager, foldingProvider);
  const commandManager = new CommandManager(
    configManager,
    decorationManager,
    statusBarManager,
    foldingManager
  );

  context.subscriptions.push(decorationManager, statusBarManager, foldingManager);

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      [{ scheme: 'file' }, { scheme: 'untitled' }],
      foldingProvider
    )
  );

  commandManager.registerCommands(context);

  // Timers are per document: a shared timer would let an edit in one file
  // cancel the pending redraw of another, leaving it uncloaked.
  const redraws = new Map<string, NodeJS.Timeout>();
  const scheduleRedraw = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    clearTimeout(redraws.get(key));
    redraws.set(
      key,
      setTimeout(() => {
        redraws.delete(key);
        decorationManager.updateDocument(document);
      }, REDRAW_DELAY_MS)
    );
  };

  context.subscriptions.push(
    {
      dispose: () => {
        redraws.forEach(clearTimeout);
        redraws.clear();
      },
    },

    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        decorationManager.updateDecorations(editor);
        await foldingManager.foldAllWhenReady(editor);
      }
    }),

    // A pane that becomes visible without becoming active -- a split, or a
    // layout restored at startup -- still has to be cloaked before it is drawn.
    // Decorating only the active editor left secrets in the clear beside it.
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      editors.forEach((editor) => decorationManager.updateDecorations(editor));
    }),

    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length > 0) {
        decorationManager.shiftRevealedLines(event);
        scheduleRedraw(event.document);
      }
    }),

    vscode.workspace.onDidCloseTextDocument((document) => {
      clearTimeout(redraws.get(document.uri.toString()));
      redraws.delete(document.uri.toString());
      decorationManager.forget(document);
      foldingManager.forget(document);
    }),

    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration('codeCloak')) {
        return;
      }
      configManager.reloadConfig();
      decorationManager.refreshAllDecorations();
      statusBarManager.update();

      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await foldingManager.unfoldAll(editor);
        await foldingManager.foldAll(editor);
      }
    })
  );

  // Every visible pane, not just the focused one: on a restored split layout
  // the other panes are already on screen by the time this runs.
  vscode.window.visibleTextEditors.forEach((editor) =>
    decorationManager.updateDecorations(editor)
  );

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    void foldingManager.foldAllWhenReady(activeEditor);
  }
  statusBarManager.update();
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
