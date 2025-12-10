import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

export class JsonParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    const fileName = document.fileName.toLowerCase();
    return fileName.endsWith('.json') || fileName.endsWith('.jsonc');
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const text = document.getText();

    try {
      // Parse JSON to validate structure
      JSON.parse(text);

      // Use regex to find key-value pairs in the text
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match "key": "value" or "key": value
        const match = line.match(/"([^"]+)"\s*:\s*("?)([^",}\]]+)\2/);
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
    } catch (error) {
      // Invalid JSON, skip parsing
      console.error('Failed to parse JSON:', error);
    }

    return results;
  }
}
