import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

export class TypeAnnotationParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    const langId = document.languageId;
    return langId === 'typescript' || langId === 'typescriptreact' || langId === 'python';
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const text = document.getText();
    const lines = text.split('\n');
    const langId = document.languageId;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (langId === 'python') {
        // Match Python variable type annotations: var: Type (include ':' and trailing whitespace)
        const varMatches = Array.from(line.matchAll(/(:\s*[a-zA-Z_][a-zA-Z0-9_[\],\s|().]*?)(\s*)(?=[=,)\]]|$)/g));
        for (const match of varMatches) {
          if (match.index !== undefined && match[1]) {
            const start = match.index;
            // Include the type annotation and any trailing whitespace before delimiter
            const fullLength = match[1].length + (match[2] ? match[2].length : 0);
            results.push({
              key: 'type',
              value: match[1].trim(),
              range: this.createRange(i, start, start + fullLength),
              lineNumber: i,
            });
          }
        }

        // Match Python return type annotations: -> Type (include '->' and trailing whitespace)
        const returnMatches = Array.from(line.matchAll(/(->\s*[a-zA-Z_][a-zA-Z0-9_[\],\s|().]*?)(\s*)(?=:|$)/g));
        for (const match of returnMatches) {
          if (match.index !== undefined && match[1]) {
            const start = match.index;
            // Include the return type and any trailing whitespace before ':'
            const fullLength = match[1].length + (match[2] ? match[2].length : 0);
            results.push({
              key: 'type',
              value: match[1].trim(),
              range: this.createRange(i, start, start + fullLength),
              lineNumber: i,
            });
          }
        }
      } else {
        // Match TypeScript type annotations: var: Type (include ':' and trailing whitespace)
        const tsMatches = Array.from(line.matchAll(/(:\s*[a-zA-Z_][a-zA-Z0-9_<>,\s|[\]{}().]*?)(\s*)(?=[=,;)\]]|$)/g));
        for (const match of tsMatches) {
          if (match.index !== undefined && match[1]) {
            const start = match.index;
            // Include the type annotation and any trailing whitespace
            const fullLength = match[1].length + (match[2] ? match[2].length : 0);
            results.push({
              key: 'type',
              value: match[1].trim(),
              range: this.createRange(i, start, start + fullLength),
              lineNumber: i,
            });
          }
        }

        // Match TypeScript generic types: <Type> (include the angle brackets)
        const genericMatches = Array.from(line.matchAll(/(<[a-zA-Z_][a-zA-Z0-9_<>,\s|[\]{}]*>)/g));
        for (const match of genericMatches) {
          if (match.index !== undefined && match[1]) {
            const start = match.index;
            results.push({
              key: 'type',
              value: match[1],
              range: this.createRange(i, start, start + match[1].length),
              lineNumber: i,
            });
          }
        }
      }
    }

    return results;
  }
}
