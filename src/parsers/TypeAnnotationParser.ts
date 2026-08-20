import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';
import { TypeScriptASTParser } from './TypeScriptASTParser';
import { PythonASTParser } from './PythonASTParser';

/** Dispatches type-annotation parsing to the parser for the document's language. */
export class TypeAnnotationParser extends BaseParser {
  private readonly parsers: BaseParser[] = [new PythonASTParser(), new TypeScriptASTParser()];

  canParse(document: vscode.TextDocument): boolean {
    return this.parsers.some((parser) => parser.canParse(document));
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    return this.parsers.find((parser) => parser.canParse(document))?.parse(document) ?? [];
  }
}
