import * as vscode from 'vscode';
import * as ts from 'typescript';
import { BaseParser, ParseResult } from './BaseParser';

export class TypeScriptASTParser extends BaseParser {
  canParse(document: vscode.TextDocument): boolean {
    const langId = document.languageId;
    return langId === 'typescript' || langId === 'typescriptreact' || langId === 'javascript' || langId === 'javascriptreact';
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const results: ParseResult[] = [];
    const sourceCode = document.getText();

    // Create a TypeScript source file for parsing
    const sourceFile = ts.createSourceFile(
      document.fileName,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    // Visit all nodes in the AST
    const visit = (node: ts.Node) => {
      // Handle parameter type annotations
      if (ts.isParameter(node) && node.type) {
        const typeNode = node.type;
        const start = typeNode.getStart(sourceFile);
        const end = typeNode.getEnd();

        // Include the colon before the type
        const colonPos = node.name.getEnd();
        const fullStart = colonPos;

        results.push({
          key: 'type',
          value: sourceCode.substring(start, end),
          range: new vscode.Range(
            document.positionAt(fullStart),
            document.positionAt(end)
          ),
          lineNumber: document.positionAt(fullStart).line,
        });
      }

      // Handle variable declaration type annotations
      if (ts.isVariableDeclaration(node) && node.type) {
        const typeNode = node.type;
        const start = typeNode.getStart(sourceFile);
        const end = typeNode.getEnd();

        // Include the colon
        const colonPos = node.name.getEnd();
        const fullStart = colonPos;

        results.push({
          key: 'type',
          value: sourceCode.substring(start, end),
          range: new vscode.Range(
            document.positionAt(fullStart),
            document.positionAt(end)
          ),
          lineNumber: document.positionAt(fullStart).line,
        });
      }

      // Handle function return type annotations
      if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) && node.type) {
        const typeNode = node.type;
        const start = typeNode.getStart(sourceFile);
        const end = typeNode.getEnd();

        // Find the position before the type (after the closing paren)
        const fullStart = sourceCode.lastIndexOf(':', start);

        results.push({
          key: 'type',
          value: sourceCode.substring(start, end),
          range: new vscode.Range(
            document.positionAt(fullStart >= 0 ? fullStart : start),
            document.positionAt(end)
          ),
          lineNumber: document.positionAt(fullStart >= 0 ? fullStart : start).line,
        });
      }

      // Handle property declarations with type annotations
      if (ts.isPropertyDeclaration(node) && node.type) {
        const typeNode = node.type;
        const start = typeNode.getStart(sourceFile);
        const end = typeNode.getEnd();

        // Include the colon
        const colonPos = node.name.getEnd();
        const fullStart = colonPos;

        results.push({
          key: 'type',
          value: sourceCode.substring(start, end),
          range: new vscode.Range(
            document.positionAt(fullStart),
            document.positionAt(end)
          ),
          lineNumber: document.positionAt(fullStart).line,
        });
      }

      // Handle type parameters (generics)
      if (node.kind === ts.SyntaxKind.TypeReference) {
        const typeRef = node as ts.TypeReferenceNode;
        if (typeRef.typeArguments) {
          typeRef.typeArguments.forEach(typeArg => {
            const start = typeArg.getStart(sourceFile);
            const end = typeArg.getEnd();

            // Include angle brackets
            const fullStart = start - 1; // Include <
            const fullEnd = end + 1; // Include >

            results.push({
              key: 'type',
              value: sourceCode.substring(start, end),
              range: new vscode.Range(
                document.positionAt(fullStart >= 0 ? fullStart : start),
                document.positionAt(fullEnd <= sourceCode.length ? fullEnd : end)
              ),
              lineNumber: document.positionAt(fullStart >= 0 ? fullStart : start).line,
            });
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return results;
  }
}
