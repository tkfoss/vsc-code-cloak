import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { DocstringParser } from '../parsers/DocstringParser';
import { CommentParser } from '../parsers/CommentParser';

export class CloakFoldingRangeProvider implements vscode.FoldingRangeProvider {
  constructor(private configManager: ConfigManager) {}

  provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    const ranges: vscode.FoldingRange[] = [];

    // Add folding ranges for docstrings
    if (this.configManager.isFeatureEnabled('docstrings')) {
      const docstringParser = new DocstringParser();
      if (docstringParser.canParse(document)) {
        const docstrings = docstringParser.parse(document);
        for (const docstring of docstrings) {
          // Only create folding ranges for multi-line docstrings
          if (docstring.range.start.line !== docstring.range.end.line) {
            ranges.push(
              new vscode.FoldingRange(
                docstring.range.start.line,
                docstring.range.end.line,
                vscode.FoldingRangeKind.Comment
              )
            );
          }
        }
      }
    }

    // Add folding ranges for multi-line block comments (only if hideBlockComments is enabled)
    if (this.configManager.isFeatureEnabled('comments') && this.configManager.getConfig().comments.hideBlockComments) {
      const commentParser = new CommentParser();
      const comments = commentParser.parse(document);
      for (const comment of comments) {
        // Only create folding ranges for multi-line block comments (/* ... */)
        // Single-line comments (// or #) remain visible
        if (comment.range.start.line !== comment.range.end.line) {
          ranges.push(
            new vscode.FoldingRange(
              comment.range.start.line,
              comment.range.end.line,
              vscode.FoldingRangeKind.Comment
            )
          );
        }
      }
    }

    return ranges;
  }
}
