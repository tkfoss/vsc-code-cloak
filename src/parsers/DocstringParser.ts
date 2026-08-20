import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

const DELIMITERS = ['"""', "'''"];
/** String prefixes Python allows before the quotes: r, b, f, u and their pairs. */
const PREFIX = /^[rbfuRBFU]{0,2}$/;

/**
 * Finds Python triple-quoted strings that begin a line.
 *
 * Any such string is treated as a docstring. That is broader than PEP 257 --
 * it also covers module-level and inline triple-quoted blocks -- which is the
 * safer default for a privacy tool: a block of prose is exactly the thing you
 * do not want on a shared screen, whether or not it is attached to a `def`.
 */
export class DocstringParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    return document.languageId === 'python' || document.languageId === 'jupyter';
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const lines = document.getText().split('\n');

    for (let i = 0; i < lines.length; i++) {
      const opening = this.openingAt(lines[i]);
      if (!opening) {
        continue;
      }

      const closing = this.findClosing(lines, i, opening);
      if (!closing) {
        break; // Unterminated docstring: everything after it is inside the string.
      }

      results.push({
        kind: 'docstring',
        key: '',
        value: this.slice(lines, i, opening.char, closing.line, closing.char),
        range: new vscode.Range(
          new vscode.Position(i, opening.char),
          new vscode.Position(closing.line, closing.char)
        ),
      });

      i = closing.line;
    }

    return results;
  }

  private openingAt(line: string): { delimiter: string; char: number } | null {
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    for (const delimiter of DELIMITERS) {
      const at = trimmed.indexOf(delimiter);
      if (at !== -1 && at <= 2 && PREFIX.test(trimmed.slice(0, at))) {
        return { delimiter, char: indent + at };
      }
    }
    return null;
  }

  private findClosing(
    lines: string[],
    startLine: number,
    opening: { delimiter: string; char: number }
  ): { line: number; char: number } | null {
    const afterOpening = opening.char + opening.delimiter.length;

    const sameLine = lines[startLine].indexOf(opening.delimiter, afterOpening);
    if (sameLine !== -1) {
      return { line: startLine, char: sameLine + opening.delimiter.length };
    }

    for (let i = startLine + 1; i < lines.length; i++) {
      const at = lines[i].indexOf(opening.delimiter);
      if (at !== -1) {
        return { line: i, char: at + opening.delimiter.length };
      }
    }
    return null;
  }

  private slice(
    lines: string[],
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
  ): string {
    if (startLine === endLine) {
      return lines[startLine].slice(startChar, endChar);
    }
    const parts = [lines[startLine].slice(startChar)];
    for (let i = startLine + 1; i < endLine; i++) {
      parts.push(lines[i]);
    }
    parts.push(lines[endLine].slice(0, endChar));
    return parts.join('\n');
  }
}
