import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

/**
 * Parses dotenv and shell assignment syntax: `KEY=value`, `export KEY=value`.
 *
 * Shell scripts are included because `.sh` is a documented secret-bearing file
 * type; irrelevant assignments are filtered out later by the key patterns.
 */
export class EnvParser extends BaseParser {
  private static readonly ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

  canParse(document: vscode.TextDocument): boolean {
    const name = this.baseName(document.fileName);
    return (
      name === '.env' ||
      name.startsWith('.env.') ||
      name.endsWith('.env') ||
      name === '.envrc' ||
      /\.(sh|bash|zsh|ksh)$/.test(name)
    );
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const lines = document.getText().split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const match = EnvParser.ASSIGNMENT.exec(trimmed);
      if (!match) {
        continue;
      }

      const indent = line.length - trimmed.length;
      const span = this.readValue(line, indent + match[0].length, ['#']);
      if (span) {
        results.push({
          kind: 'secret',
          key: match[1],
          value: span.value,
          range: this.createRange(i, span.start, span.end),
        });
      }
    }

    return results;
  }

  private baseName(filePath: string): string {
    return filePath.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
  }
}
