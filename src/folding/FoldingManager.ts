import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { DocstringParser } from '../parsers/DocstringParser';
import { CommentParser } from '../parsers/CommentParser';

export class FoldingManager {
  constructor(private configManager: ConfigManager) {}

  public async foldAll(editor: vscode.TextEditor): Promise<void> {
    if (!this.configManager.isEnabled()) {
      return;
    }

    const ranges: vscode.Range[] = [];

    // Collect docstring ranges to fold
    if (this.configManager.isDocstringsHidden()) {
      const docstringParser = new DocstringParser();
      if (docstringParser.canParse(editor.document)) {
        const docstrings = docstringParser.parse(editor.document);
        for (const docstring of docstrings) {
          // Only fold multi-line docstrings
          if (docstring.range.start.line !== docstring.range.end.line) {
            ranges.push(docstring.range);
          }
        }
      }
    }

    // Collect multi-line block comment ranges to fold (only if hideBlockComments is enabled)
    if (this.configManager.isCommentsHidden() && this.configManager.getConfig().comments.hideBlockComments) {
      const commentParser = new CommentParser();
      const comments = commentParser.parse(editor.document);
      for (const comment of comments) {
        // Only fold multi-line block comments (/* ... */)
        if (comment.range.start.line !== comment.range.end.line) {
          ranges.push(comment.range);
        }
      }
    }

    // Fold the collected ranges
    if (ranges.length > 0) {
      await this.foldRanges(editor, ranges);
    }
  }

  public async unfoldAll(editor: vscode.TextEditor): Promise<void> {
    // Unfold all regions in the editor
    await vscode.commands.executeCommand('editor.unfoldAll');
  }

  private async foldRanges(editor: vscode.TextEditor, ranges: vscode.Range[]): Promise<void> {
    // VS Code doesn't have a direct API to fold specific ranges programmatically
    // We need to use the fold command for each range
    for (const range of ranges) {
      // Move cursor to the range and fold
      editor.selection = new vscode.Selection(range.start, range.start);
      await vscode.commands.executeCommand('editor.fold', {
        levels: 1,
        direction: 'down',
        selectionLines: [range.start.line]
      });
    }
  }

  public async toggleFolding(editor: vscode.TextEditor): Promise<void> {
    if (this.configManager.isDocstringsHidden()) {
      await this.foldAll(editor);
    } else {
      await this.unfoldAll(editor);
    }
  }
}
