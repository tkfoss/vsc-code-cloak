import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

export class EnvParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    const fileName = document.fileName.toLowerCase();
    return (
      fileName.endsWith('.env') ||
      fileName.includes('.env.') ||
      fileName.endsWith('.envrc')
    );
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments and empty lines
      if (!line || line.startsWith('#')) {
        continue;
      }

      // Match KEY=VALUE or export KEY=VALUE
      const match = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
      if (match) {
        const key = match[1];
        const value = match[2];

        // Find the actual position in the line
        const originalLine = lines[i];
        const valueStart = originalLine.indexOf(value);
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
