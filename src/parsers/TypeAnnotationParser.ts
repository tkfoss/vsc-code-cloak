import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';
import { TypeScriptASTParser } from './TypeScriptASTParser';
import { PythonASTParser } from './PythonASTParser';

/**
 * Main type annotation parser that delegates to language-specific AST parsers
 */
export class TypeAnnotationParser extends BaseParser {
  private tsParser = new TypeScriptASTParser();
  private pyParser = new PythonASTParser();

  canParse(document: vscode.TextDocument): boolean {
    return this.tsParser.canParse(document) || this.pyParser.canParse(document);
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    if (this.pyParser.canParse(document)) {
      return this.pyParser.parse(document);
    } else if (this.tsParser.canParse(document)) {
      return this.tsParser.parse(document);
    }
    return [];
  }
}
