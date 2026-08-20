import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { CloakFoldingRangeProvider } from './FoldingProvider';

/**
 * How long to wait before the second fold pass. Long enough for VS Code to
 * have built its folding model for a newly opened editor, short enough that a
 * region never sits uncollapsed long enough to read.
 */
const FOLD_SETTLE_MS = 250;

/**
 * Drives VS Code's folding commands.
 *
 * There is no API to fold a range directly, so this goes through `editor.fold`,
 * which acts on the active editor only. Every fold is issued in a single
 * command with all start lines at once: folding them one at a time would move
 * the cursor repeatedly and scroll the document under the user.
 *
 * The lines this folded are remembered per document so they can be given back
 * individually. `editor.unfoldAll` would also expand the functions, imports and
 * regions the user had collapsed themselves, which is not ours to undo.
 */
export class FoldingManager {
  /** Start lines this manager folded, per document URI. */
  private readonly folded = new Map<string, number[]>();
  /** Pending settle retries, per document URI. */
  private readonly retries = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly configManager: ConfigManager,
    private readonly foldingProvider: CloakFoldingRangeProvider
  ) {}

  /**
   * Folds, then folds again once the editor has settled.
   *
   * `editor.fold` acts on VS Code's folding model, which is computed
   * asynchronously after the folding provider is queried. On a freshly opened
   * editor that model is usually still empty when activation runs, so the first
   * call silently does nothing and the region stays open. Folding is idempotent,
   * so the second pass is free when the first already worked.
   */
  public async foldAllWhenReady(editor: vscode.TextEditor): Promise<void> {
    await this.foldAll(editor);

    const key = editor.document.uri.toString();
    clearTimeout(this.retries.get(key));
    this.retries.set(
      key,
      setTimeout(() => {
        this.retries.delete(key);
        void this.foldAll(editor);
      }, FOLD_SETTLE_MS)
    );
  }

  public async foldAll(editor: vscode.TextEditor): Promise<void> {
    if (
      !this.configManager.isEnabled() ||
      !this.configManager.isFoldingEnabled() ||
      !this.isActive(editor) ||
      this.configManager.isFileExcluded(editor.document.fileName)
    ) {
      return;
    }

    const lines = this.foldingProvider
      .foldableRanges(editor.document)
      .filter(({ feature }) => this.configManager.isHidden(feature))
      .map(({ range }) => range.start.line);

    if (lines.length === 0) {
      return;
    }

    const key = editor.document.uri.toString();
    this.folded.set(key, [...new Set([...(this.folded.get(key) ?? []), ...lines])]);

    await this.preservingViewport(editor, () =>
      vscode.commands.executeCommand('editor.fold', {
        levels: 1,
        direction: 'down',
        selectionLines: lines,
      })
    );
  }

  /** Reopens only the regions this manager folded, leaving the user's own alone. */
  public async unfoldAll(editor: vscode.TextEditor): Promise<void> {
    if (!this.isActive(editor)) {
      return;
    }

    const key = editor.document.uri.toString();
    const lines = this.folded.get(key);
    this.folded.delete(key);

    if (!lines?.length) {
      return;
    }

    await this.preservingViewport(editor, () =>
      vscode.commands.executeCommand('editor.unfold', {
        levels: 1,
        direction: 'down',
        selectionLines: lines,
      })
    );
  }

  public forget(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    clearTimeout(this.retries.get(key));
    this.retries.delete(key);
    this.folded.delete(key);
  }

  public dispose(): void {
    this.retries.forEach(clearTimeout);
    this.retries.clear();
    this.folded.clear();
  }

  private isActive(editor: vscode.TextEditor): boolean {
    return editor === vscode.window.activeTextEditor;
  }

  private async preservingViewport(
    editor: vscode.TextEditor,
    action: () => Thenable<unknown>
  ): Promise<void> {
    const selection = editor.selection;
    const [visible] = editor.visibleRanges;

    await action();

    editor.selection = selection;
    if (visible) {
      editor.revealRange(visible, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  }
}
