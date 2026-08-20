import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

/**
 * Parses the flat `key = value` / `key: value` family: `.properties`, `.ini`,
 * `.conf`, `.cfg` and `.toml`.
 *
 * TOML tables and INI sections (`[section]`) are skipped rather than parsed as
 * structure; only the leaf assignments carry values worth hiding.
 */
export class PropertiesParser extends BaseParser {
  private static readonly ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_.-]*|"[^"]+")\s*[=:]/;

  canParse(document: vscode.TextDocument): boolean {
    return /\.(properties|ini|conf|cfg|toml)$/i.test(document.fileName);
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const lines = document.getText().split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      if (
        !trimmed ||
        trimmed.startsWith('#') ||
        trimmed.startsWith(';') ||
        trimmed.startsWith('[')
      ) {
        continue;
      }

      const match = PropertiesParser.ASSIGNMENT.exec(trimmed);
      if (!match) {
        continue;
      }

      const indent = line.length - trimmed.length;
      const span = this.readValue(line, indent + match[0].length, ['#', ';']);
      if (span) {
        results.push({
          kind: 'secret',
          key: match[1].replace(/^"|"$/g, ''),
          value: span.value,
          range: this.createRange(i, span.start, span.end),
        });
      }
    }

    return results;
  }
}
