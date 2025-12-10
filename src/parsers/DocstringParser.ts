import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

export class DocstringParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    const langId = document.languageId;
    return langId === 'python' || langId === 'jupyter';
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    let inDocstring = false;
    let docstringDelimiter = '';
    let docstringStartLine = -1;
    let docstringStartChar = -1;
    let docstringContent = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for docstring start/end (""" or ''')
      if (!inDocstring && (trimmed.startsWith('"""') || trimmed.startsWith("'''"))) {
        inDocstring = true;
        docstringDelimiter = trimmed.substring(0, 3);
        docstringStartLine = i;
        docstringStartChar = line.indexOf(docstringDelimiter);

        // Check if it's a single-line docstring
        if (trimmed.length > 3 && trimmed.endsWith(docstringDelimiter)) {
          const start = line.indexOf(docstringDelimiter);
          const end = line.lastIndexOf(docstringDelimiter) + 3;
          results.push({
            key: 'docstring',
            value: line.substring(start, end),
            range: this.createRange(i, start, end),
            lineNumber: i,
          });
          inDocstring = false;
          continue;
        }
        docstringContent = line.substring(docstringStartChar);
      } else if (inDocstring) {
        docstringContent += '\n' + line;

        // Check if this line ends the docstring
        if (trimmed.endsWith(docstringDelimiter)) {
          const endChar = line.lastIndexOf(docstringDelimiter) + 3;

          // Create a multi-line range from start to end
          const range = new vscode.Range(
            new vscode.Position(docstringStartLine, docstringStartChar),
            new vscode.Position(i, endChar)
          );

          results.push({
            key: 'docstring',
            value: docstringContent,
            range: range,
            lineNumber: docstringStartLine,
          });

          inDocstring = false;
          docstringContent = '';
        }
      }
    }

    return results;
  }
}
