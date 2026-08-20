import * as vscode from 'vscode';

/**
 * Builds an object satisfying the slice of `TextDocument` the parsers use.
 * `languageId` is derived from the file extension unless given explicitly.
 */
export function makeDocument(
  text: string,
  fileName = 'file.txt',
  languageId?: string
): vscode.TextDocument {
  const lines = text.split('\n');

  return {
    fileName,
    languageId: languageId ?? languageIdFor(fileName),
    version: 1,
    lineCount: lines.length,
    uri: { toString: () => `file://${fileName}` },
    getText: () => text,
    lineAt: (line: number) => ({ text: lines[line] }),
    positionAt: (offset: number) => {
      let remaining = offset;
      for (let line = 0; line < lines.length; line++) {
        if (remaining <= lines[line].length) {
          return new vscode.Position(line, remaining);
        }
        remaining -= lines[line].length + 1;
      }
      return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
    },
  } as unknown as vscode.TextDocument;
}

function languageIdFor(fileName: string): string {
  const extension = fileName.split('.').pop();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    py: 'python',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shellscript',
    toml: 'toml',
  };
  return map[extension ?? ''] ?? 'plaintext';
}

/** The source text a parse result covers, useful for asserting on ranges. */
export function textOf(document: vscode.TextDocument, range: vscode.Range): string {
  const lines = document.getText().split('\n');
  if (range.start.line === range.end.line) {
    return lines[range.start.line].slice(range.start.character, range.end.character);
  }
  return [
    lines[range.start.line].slice(range.start.character),
    ...lines.slice(range.start.line + 1, range.end.line),
    lines[range.end.line].slice(0, range.end.character),
  ].join('\n');
}
