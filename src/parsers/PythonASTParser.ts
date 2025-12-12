import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

/**
 * Python AST-inspired parser for type annotations
 * Uses a more sophisticated tokenization approach than simple regex
 */
export class PythonASTParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    return document.languageId === 'python';
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Parse parameter and variable type annotations
      this.parseVariableAnnotations(line, lineNum, results);

      // Parse return type annotations
      this.parseReturnAnnotations(line, lineNum, results);
    }

    return results;
  }

  private parseVariableAnnotations(line: string, lineNum: number, results: ParseResult[]): void {
    // Match variable annotations: name: type
    // This handles: def foo(x: int, y: List[str]), var: str = "hello", etc.

    let pos = 0;
    while (pos < line.length) {
      // Find colon that's not inside strings or brackets
      const colonIndex = this.findNextColon(line, pos);
      if (colonIndex === -1) break;

      // Check if this is a type annotation (not dict key or slice)
      if (this.isTypeAnnotation(line, colonIndex)) {
        const typeInfo = this.extractTypeAnnotation(line, colonIndex);
        if (typeInfo) {
          results.push({
            key: 'type',
            value: typeInfo.type,
            range: this.createRange(lineNum, typeInfo.start, typeInfo.end),
            lineNumber: lineNum,
          });
          pos = typeInfo.end;
        } else {
          pos = colonIndex + 1;
        }
      } else {
        pos = colonIndex + 1;
      }
    }
  }

  private parseReturnAnnotations(line: string, lineNum: number, results: ParseResult[]): void {
    // Match return type annotations: -> Type
    const arrowIndex = line.indexOf('->');
    if (arrowIndex === -1) return;

    // Make sure it's not in a string
    if (this.isInsideString(line, arrowIndex)) return;

    const typeInfo = this.extractReturnType(line, arrowIndex);
    if (typeInfo) {
      results.push({
        key: 'type',
        value: typeInfo.type,
        range: this.createRange(lineNum, typeInfo.start, typeInfo.end),
        lineNumber: lineNum,
      });
    }
  }

  private findNextColon(line: string, startPos: number): number {
    let inString = false;
    let stringChar = '';
    let bracketDepth = 0;
    let parenDepth = 0;

    for (let i = startPos; i < line.length; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';

      // Handle strings
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (inString) continue;

      // Track brackets
      if (char === '[') bracketDepth++;
      if (char === ']') bracketDepth--;
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;

      // Found a colon at the right depth
      if (char === ':' && bracketDepth === 0 && parenDepth === 0) {
        return i;
      }
    }

    return -1;
  }

  private isTypeAnnotation(line: string, colonIndex: number): boolean {
    // Check context before colon
    const before = line.substring(0, colonIndex).trim();

    // Not a type annotation if it's inside dict literal or lambda
    if (before.endsWith('{')) return false;
    if (before.includes('lambda')) return false;

    // Check if there's a valid identifier before the colon
    const identMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
    if (!identMatch) return false;

    // Check what comes after the colon
    const after = line.substring(colonIndex + 1).trim();
    if (after.length === 0) return false;

    // Should start with a type (uppercase or lowercase letter, or special types)
    return /^[a-zA-Z_]/.test(after);
  }

  private extractTypeAnnotation(line: string, colonIndex: number): { type: string; start: number; end: number } | null {
    let typeEnd = colonIndex + 1;
    let bracketDepth = 0;
    let parenDepth = 0;
    let inString = false;
    let stringChar = '';

    // Skip initial whitespace
    while (typeEnd < line.length && /\s/.test(line[typeEnd])) {
      typeEnd++;
    }

    const typeStart = typeEnd;

    // Extract the type annotation
    while (typeEnd < line.length) {
      const char = line[typeEnd];
      const prevChar = typeEnd > 0 ? line[typeEnd - 1] : '';

      // Handle strings
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (!inString) {
        if (char === '[') bracketDepth++;
        if (char === ']') bracketDepth--;
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;

        // End of type annotation
        if (bracketDepth === 0 && parenDepth === 0) {
          if (char === '=' || char === ',' || char === ')' || char === ']') {
            break;
          }
        }
      }

      typeEnd++;
    }

    // Trim trailing whitespace
    while (typeEnd > typeStart && /\s/.test(line[typeEnd - 1])) {
      typeEnd--;
    }

    if (typeEnd <= typeStart) return null;

    const type = line.substring(typeStart, typeEnd);

    return {
      type,
      start: colonIndex,
      end: typeEnd
    };
  }

  private extractReturnType(line: string, arrowIndex: number): { type: string; start: number; end: number } | null {
    let typeStart = arrowIndex + 2; // After '->'

    // Skip whitespace
    while (typeStart < line.length && /\s/.test(line[typeStart])) {
      typeStart++;
    }

    let typeEnd = typeStart;
    let bracketDepth = 0;
    let parenDepth = 0;

    // Extract until we hit a colon (function body start)
    while (typeEnd < line.length) {
      const char = line[typeEnd];

      if (char === '[') bracketDepth++;
      if (char === ']') bracketDepth--;
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;

      if (bracketDepth === 0 && parenDepth === 0 && char === ':') {
        break;
      }

      typeEnd++;
    }

    // Trim trailing whitespace
    while (typeEnd > typeStart && /\s/.test(line[typeEnd - 1])) {
      typeEnd--;
    }

    if (typeEnd <= typeStart) return null;

    const type = line.substring(typeStart, typeEnd);

    return {
      type,
      start: arrowIndex,
      end: typeEnd
    };
  }

  private isInsideString(line: string, pos: number): boolean {
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < pos; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';

      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
    }

    return inString;
  }
}
