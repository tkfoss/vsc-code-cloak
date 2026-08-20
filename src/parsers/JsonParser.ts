import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

/**
 * Token-scanning JSON/JSONC parser.
 *
 * Deliberately does not call `JSON.parse`: a file being edited is invalid most
 * of the time, and JSONC comments are never valid JSON. Refusing to parse those
 * would leave secrets on screen exactly while they are being typed. The scanner
 * tracks strings and comments itself and recovers from malformed input by
 * carrying on to the next token.
 */
export class JsonParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    return (
      /\.jsonc?$/i.test(document.fileName) ||
      document.languageId === 'json' ||
      document.languageId === 'jsonc'
    );
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const text = document.getText();
    let pendingKey: { name: string } | null = null;
    let i = 0;

    while (i < text.length) {
      const char = text[i];

      if (char === '/' && text[i + 1] === '/') {
        i = this.endOfLine(text, i);
        continue;
      }
      if (char === '/' && text[i + 1] === '*') {
        const close = text.indexOf('*/', i + 2);
        i = close === -1 ? text.length : close + 2;
        continue;
      }

      if (char === '"') {
        const end = this.endOfString(text, i);
        const raw = text.slice(i + 1, end);

        if (pendingKey) {
          results.push(this.toResult(document, pendingKey.name, raw, i + 1, end));
          pendingKey = null;
          i = end + 1;
          continue;
        }

        const next = this.nextMeaningful(text, end + 1);
        if (next !== -1 && text[next] === ':') {
          pendingKey = { name: raw };
          i = next + 1;
        } else {
          i = end + 1;
        }
        continue;
      }

      if (pendingKey && !/\s/.test(char)) {
        if (char === '{' || char === '[') {
          // Container value: descend into it, the leaves are handled on their own.
          pendingKey = null;
          i++;
          continue;
        }
        const end = this.endOfLiteral(text, i);
        if (end > i) {
          results.push(this.toResult(document, pendingKey.name, text.slice(i, end), i, end));
        }
        pendingKey = null;
        i = Math.max(end, i + 1);
        continue;
      }

      i++;
    }

    return results;
  }

  private toResult(
    document: vscode.TextDocument,
    key: string,
    value: string,
    start: number,
    end: number
  ): ParseResult {
    return {
      kind: 'secret',
      key,
      value,
      range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
    };
  }

  private endOfString(text: string, openIndex: number): number {
    for (let i = openIndex + 1; i < text.length; i++) {
      if (text[i] === '\\') {
        i++;
        continue;
      }
      if (text[i] === '"' || text[i] === '\n') {
        return i;
      }
    }
    return text.length;
  }

  private endOfLiteral(text: string, start: number): number {
    let i = start;
    while (i < text.length && !/[\s,}\]]/.test(text[i])) {
      i++;
    }
    return i;
  }

  private endOfLine(text: string, start: number): number {
    const nl = text.indexOf('\n', start);
    return nl === -1 ? text.length : nl;
  }

  /** Index of the next non-whitespace, non-comment character, or -1. */
  private nextMeaningful(text: string, start: number): number {
    let i = start;
    while (i < text.length) {
      if (/\s/.test(text[i])) {
        i++;
      } else if (text[i] === '/' && text[i + 1] === '/') {
        i = this.endOfLine(text, i);
      } else if (text[i] === '/' && text[i + 1] === '*') {
        const close = text.indexOf('*/', i + 2);
        i = close === -1 ? text.length : close + 2;
      } else {
        return i;
      }
    }
    return -1;
  }
}
