import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

export class YamlParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    const fileName = document.fileName.toLowerCase();
    return fileName.endsWith('.yaml') || fileName.endsWith('.yml');
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments and empty lines
      if (!line.trim() || line.trim().startsWith('#')) {
        continue;
      }

      // Match key: value or key: "value" or key: 'value'
      const match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(['"]?)(.+?)\2\s*$/);
      if (match) {
        const key = match[1];
        const value = match[3];
        const valueStart = line.indexOf(value);

        if (valueStart !== -1) {
          results.push({
            key,
            value,
            range: this.createRange(i, valueStart, valueStart + value.length),
            lineNumber: i,
          });
        }
      }
    }

    return results;
  }
}
