import * as vscode from 'vscode';
import * as ts from 'typescript';
import { BaseParser, ParseResult } from './BaseParser';

/**
 * Extracts TypeScript type annotations from the compiler's own AST.
 *
 * Each annotation is reported from its leading `:` (or `=>` for a call
 * signature) through the end of the type node, so hiding it leaves syntax that
 * still reads like valid JavaScript. Nested type nodes are not visited: the
 * outermost annotation already covers them, and overlapping decorations on the
 * same decoration type render unpredictably.
 */
export class TypeScriptASTParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    return ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(
      document.languageId
    );
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const source = document.getText();
    const sourceFile = ts.createSourceFile(
      document.fileName,
      source,
      ts.ScriptTarget.Latest,
      true,
      this.scriptKind(document.languageId)
    );

    const visit = (node: ts.Node): void => {
      const typeNode = this.annotationOf(node);
      // Once an annotation is masked, its own children must not be visited:
      // a nested property signature would decorate a range already covered.
      const masked = typeNode ? this.push(document, source, typeNode, results) : false;
      ts.forEachChild(node, (child) => {
        if (!(masked && child === typeNode)) {
          visit(child);
        }
      });
    };
    visit(sourceFile);

    // The AST is visited outside-in, so a return type is reached before the
    // parameters it follows. Emit in document order instead.
    return results.sort((a, b) => a.range.start.compareTo(b.range.start));
  }

  /** The type node annotating `node`, if this node kind carries one. */
  private annotationOf(node: ts.Node): ts.TypeNode | undefined {
    if (
      ts.isParameter(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isGetAccessor(node) ||
      ts.isCallSignatureDeclaration(node)
    ) {
      return node.type;
    }
    return undefined;
  }

  /** Returns true when the annotation was masked. */
  private push(
    document: vscode.TextDocument,
    source: string,
    typeNode: ts.TypeNode,
    results: ParseResult[]
  ): boolean {
    const typeStart = typeNode.getStart();
    const end = typeNode.getEnd();
    // Swallow the annotation's `:` so the remaining text still parses as JS.
    const colon = source.lastIndexOf(':', typeStart);
    const start = colon === -1 ? typeStart : colon;

    const range = new vscode.Range(document.positionAt(start), document.positionAt(end));
    if (range.start.line !== range.end.line) {
      return false; // Multi-line annotations cannot be masked by a decoration.
    }

    results.push({ kind: 'type', key: '', value: source.slice(start, end), range });
    return true;
  }

  private scriptKind(languageId: string): ts.ScriptKind {
    switch (languageId) {
      case 'typescriptreact':
        return ts.ScriptKind.TSX;
      case 'javascript':
        return ts.ScriptKind.JS;
      case 'javascriptreact':
        return ts.ScriptKind.JSX;
      default:
        return ts.ScriptKind.TS;
    }
  }
}
