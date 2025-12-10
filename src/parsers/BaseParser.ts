import * as vscode from 'vscode';

export interface ParseResult {
  key: string;
  value: string;
  range: vscode.Range;
  lineNumber: number;
}

export abstract class BaseParser {
  abstract canParse(document: vscode.TextDocument): boolean;
  abstract parse(document: vscode.TextDocument): ParseResult[];

  protected createRange(
    lineNumber: number,
    startChar: number,
    endChar: number
  ): vscode.Range {
    return new vscode.Range(
      new vscode.Position(lineNumber, startChar),
      new vscode.Position(lineNumber, endChar)
    );
  }
}
