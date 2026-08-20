import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

interface CommentSyntax {
  line: string[];
  block: Array<[string, string]>;
  /** Delimiters that open a string which may span lines (Python/JS templates). */
  multilineString: string[];
}

const C_FAMILY: CommentSyntax = { line: ['//'], block: [['/*', '*/']], multilineString: ['`'] };
const HASH: CommentSyntax = { line: ['#'], block: [], multilineString: [] };
const PYTHON: CommentSyntax = { line: ['#'], block: [], multilineString: ['"""', "'''"] };
const MARKUP: CommentSyntax = { line: [], block: [['<!--', '-->']], multilineString: [] };

const SYNTAX_BY_LANGUAGE: Record<string, CommentSyntax> = {
  python: PYTHON,
  jupyter: PYTHON,
  shellscript: HASH,
  dockerfile: HASH,
  makefile: HASH,
  yaml: HASH,
  toml: HASH,
  ini: HASH,
  properties: HASH,
  ruby: HASH,
  perl: HASH,
  r: HASH,
  powershell: { line: ['#'], block: [['<#', '#>']], multilineString: [] },
  html: MARKUP,
  xml: MARKUP,
  markdown: MARKUP,
  vue: MARKUP,
  svelte: MARKUP,
  css: { line: [], block: [['/*', '*/']], multilineString: [] },
  sql: { line: ['--'], block: [['/*', '*/']], multilineString: [] },
  lua: { line: ['--'], block: [['--[[', ']]']], multilineString: [] },
  haskell: { line: ['--'], block: [['{-', '-}']], multilineString: [] },
};

/**
 * Language-aware comment scanner.
 *
 * Tracks string state so that `//` inside a URL, `#` inside an f-string and any
 * delimiter inside a quoted literal are not mistaken for comments. Results are
 * tagged `line` or `block` in `key` so callers can honour the two independent
 * `codeCloak.comments.*` settings.
 */
export class CommentParser extends BaseParser {
  canParse(_document: vscode.TextDocument): boolean {
    return true;
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const syntax = this.syntaxFor(document.languageId);
    const results: ParseResult[] = [];
    const lines = document.getText().split('\n');

    let openBlock: { close: string; line: number; char: number } | null = null;
    let openString: string | null = null;

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      let i = 0;

      while (i < line.length) {
        if (openBlock) {
          const close = line.indexOf(openBlock.close, i);
          if (close === -1) {
            break;
          }
          const end = close + openBlock.close.length;
          results.push({
            kind: 'comment',
            key: 'block',
            value: this.slice(lines, openBlock.line, openBlock.char, lineNumber, end),
            range: new vscode.Range(
              new vscode.Position(openBlock.line, openBlock.char),
              new vscode.Position(lineNumber, end)
            ),
          });
          openBlock = null;
          i = end;
          continue;
        }

        if (openString) {
          const close = line.indexOf(openString, i);
          if (close === -1) {
            break;
          }
          i = close + openString.length;
          openString = null;
          continue;
        }

        const stringDelimiter = this.stringAt(line, i, syntax);
        if (stringDelimiter) {
          const consumed = this.consumeString(line, i, stringDelimiter);
          if (consumed === -1) {
            if (syntax.multilineString.includes(stringDelimiter)) {
              openString = stringDelimiter;
            }
            break;
          }
          i = consumed;
          continue;
        }

        const blockStart = syntax.block.find(([open]) => line.startsWith(open, i));
        if (blockStart) {
          openBlock = { close: blockStart[1], line: lineNumber, char: i };
          i += blockStart[0].length;
          continue;
        }

        const lineToken = syntax.line.find((token) => line.startsWith(token, i));
        if (lineToken) {
          results.push({
            kind: 'comment',
            key: 'line',
            value: line.slice(i),
            range: this.createRange(lineNumber, i, line.length),
          });
          break;
        }

        i++;
      }
    }

    return results;
  }

  private syntaxFor(languageId: string): CommentSyntax {
    return SYNTAX_BY_LANGUAGE[languageId] ?? C_FAMILY;
  }

  /** The string delimiter opening at `i`, longest first so `"""` beats `"`. */
  private stringAt(line: string, i: number, syntax: CommentSyntax): string | null {
    for (const delimiter of syntax.multilineString) {
      if (line.startsWith(delimiter, i)) {
        return delimiter;
      }
    }
    return line[i] === '"' || line[i] === "'" ? line[i] : null;
  }

  /** Index just past the closing delimiter, or -1 if the string does not close on this line. */
  private consumeString(line: string, openIndex: number, delimiter: string): number {
    for (let i = openIndex + delimiter.length; i < line.length; i++) {
      if (line[i] === '\\') {
        i++;
        continue;
      }
      if (line.startsWith(delimiter, i)) {
        return i + delimiter.length;
      }
    }
    return -1;
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
