import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

export class CommentParser extends BaseParser {
  canParse(_document: vscode.TextDocument): boolean {
    // Works for most languages
    return true;
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    let inBlockComment = false;
    let blockCommentStartLine = -1;
    let blockCommentStartChar = -1;
    let blockCommentContent = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle block comments /* ... */
      if (line.includes('/*') && !inBlockComment) {
        inBlockComment = true;
        blockCommentStartLine = i;
        blockCommentStartChar = line.indexOf('/*');
        blockCommentContent = line.substring(blockCommentStartChar);

        // Check for single-line block comment
        if (line.includes('*/')) {
          const endChar = line.indexOf('*/') + 2;
          results.push({
            key: 'comment',
            value: line.substring(blockCommentStartChar, endChar),
            range: this.createRange(i, blockCommentStartChar, endChar),
            lineNumber: i,
          });
          inBlockComment = false;
          continue;
        }
      } else if (inBlockComment) {
        blockCommentContent += '\n' + line;

        if (line.includes('*/')) {
          const endChar = line.indexOf('*/') + 2;

          // Create multi-line range for block comment
          const range = new vscode.Range(
            new vscode.Position(blockCommentStartLine, blockCommentStartChar),
            new vscode.Position(i, endChar)
          );

          results.push({
            key: 'comment',
            value: blockCommentContent,
            range: range,
            lineNumber: blockCommentStartLine,
          });

          inBlockComment = false;
          blockCommentContent = '';
          continue;
        }
      }

      // Handle single-line comments (only if not in block comment)
      if (!inBlockComment) {
        const commentMatch = line.match(/\/\/(.*)$|#(.*)$/);
        if (commentMatch) {
          const commentText = commentMatch[1] || commentMatch[2];
          const start = line.indexOf(commentText);
          results.push({
            key: 'comment',
            value: commentText,
            range: this.createRange(i, start - 2, line.length),
            lineNumber: i,
          });
        }
      }
    }

    return results;
  }
}
