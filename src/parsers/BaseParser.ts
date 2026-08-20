import * as vscode from 'vscode';

/** What a parse result represents, used to route it to the right feature toggle. */
export type CloakKind = 'secret' | 'type' | 'comment' | 'docstring';

export interface ParseResult {
  kind: CloakKind;
  /** Key name for secrets; empty for kinds that have no key. */
  key: string;
  /** The raw source text covered by `range`. */
  value: string;
  range: vscode.Range;
}

/** A value located inside a single source line, as character offsets into that line. */
export interface ValueSpan {
  value: string;
  start: number;
  end: number;
}

export abstract class BaseParser {
  abstract canParse(document: vscode.TextDocument): boolean;

  /**
   * Extract the regions to cloak.
   *
   * Results may span lines. A masking decoration cannot cross a line break, so
   * `DecorationManager` splits multi-line results into one range per line
   * before rendering; the folding layer consumes them unsplit.
   *
   * Emit a multi-line range only where every line of it should be hidden --
   * prose such as a docstring or a block comment. A construct interleaved with
   * code that must stay readable, such as a wrapped type annotation, should be
   * dropped instead, since splitting it would mask the code between its lines.
   */
  abstract parse(document: vscode.TextDocument): ParseResult[];

  protected createRange(line: number, startChar: number, endChar: number): vscode.Range {
    return new vscode.Range(
      new vscode.Position(line, startChar),
      new vscode.Position(line, endChar)
    );
  }

  /**
   * Read the value that follows a `key=` / `key:` delimiter.
   *
   * Quoted values report the span inside the quotes so the quotes stay visible
   * and the reader can still tell a string from a bare token. Unquoted values
   * stop at a trailing comment introduced by any of `commentChars` preceded by
   * whitespace, which is the rule dotenv, INI and YAML all use.
   *
   * Returns null when the value is empty, since there is nothing to hide.
   */
  protected readValue(line: string, from: number, commentChars: string[] = []): ValueSpan | null {
    let start = from;
    while (start < line.length && /\s/.test(line[start])) {
      start++;
    }
    if (start >= line.length) {
      return null;
    }

    const quote = line[start];
    if (quote === '"' || quote === "'" || quote === '`') {
      const close = this.findClosingQuote(line, start);
      if (close !== -1) {
        return close === start + 1
          ? null
          : { value: line.slice(start + 1, close), start: start + 1, end: close };
      }
      // Unterminated quote: fall through and treat the rest of the line as the value.
    }

    let end = line.length;
    for (let i = start; i < line.length; i++) {
      if (commentChars.includes(line[i]) && i > start && /\s/.test(line[i - 1])) {
        end = i;
        break;
      }
    }
    while (end > start && /\s/.test(line[end - 1])) {
      end--;
    }

    return end > start ? { value: line.slice(start, end), start, end } : null;
  }

  private findClosingQuote(line: string, openIndex: number): number {
    const quote = line[openIndex];
    for (let i = openIndex + 1; i < line.length; i++) {
      if (line[i] === '\\') {
        i++;
        continue;
      }
      if (line[i] === quote) {
        return i;
      }
    }
    return -1;
  }
}
