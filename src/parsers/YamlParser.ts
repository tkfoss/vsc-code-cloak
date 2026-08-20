import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

/**
 * Line-oriented YAML parser for `key: value` mappings.
 *
 * Block scalars (`key: |`, `key: >`) are followed and every line of the block is
 * emitted separately, because that is where multi-line credentials such as PEM
 * keys live, and because the decoration layer only renders single-line ranges.
 */
export class YamlParser extends BaseParser {
  private static readonly MAPPING =
    /^(\s*)(?:-\s+)?(?:(["'])([^"']+)\2|([A-Za-z_][\w.-]*))\s*:(?=\s|$)/;

  canParse(document: vscode.TextDocument): boolean {
    return /\.ya?ml$/i.test(document.fileName) || document.languageId === 'yaml';
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const lines = document.getText().split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...') {
        continue;
      }

      const match = YamlParser.MAPPING.exec(line);
      if (!match) {
        continue;
      }

      const key = match[3] ?? match[4];
      const indent = match[1].length;
      const span = this.readValue(line, match[0].length, ['#']);

      if (!span) {
        continue;
      }

      if (/^[|>][+-]?\d*$/.test(span.value)) {
        i = this.collectBlockScalar(lines, i + 1, indent, key, results) - 1;
        continue;
      }

      results.push({
        kind: 'secret',
        key,
        value: span.value,
        range: this.createRange(i, span.start, span.end),
      });
    }

    return results;
  }

  /** Emits one result per line of a block scalar; returns the first line after it. */
  private collectBlockScalar(
    lines: string[],
    start: number,
    parentIndent: number,
    key: string,
    results: ParseResult[]
  ): number {
    let i = start;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent <= parentIndent) {
        break;
      }
      results.push({
        kind: 'secret',
        key,
        value: line.slice(indent),
        range: this.createRange(i, indent, line.length),
      });
    }
    return i;
  }
}
