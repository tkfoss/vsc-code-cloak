import * as vscode from 'vscode';
import { BaseParser, ParseResult } from './BaseParser';

/**
 * Extracts Python type annotations: parameter annotations, return annotations
 * and variable annotations (PEP 526).
 *
 * Works on offsets over the whole document rather than line by line, because
 * function signatures are routinely wrapped across several lines. Annotations
 * that themselves span more than one line are skipped, since the decoration
 * layer can only mask single-line ranges.
 */
export class PythonASTParser extends BaseParser {
  private static readonly DEF = /(?:^|\n)[ \t]*(?:async[ \t]+)?def[ \t]+[A-Za-z_]\w*[ \t]*\(/g;
  private static readonly VARIABLE =
    /^([ \t]*)((?:self\.|cls\.)?[A-Za-z_]\w*)[ \t]*(:)[ \t]*([^=\n]+?)[ \t]*(?:=(?!=)|$)/;

  canParse(document: vscode.TextDocument): boolean {
    return document.languageId === 'python';
  }

  parse(document: vscode.TextDocument): ParseResult[] {
    const text = document.getText();
    const results: ParseResult[] = [];

    const signatures = this.parseSignatures(document, text, results);
    this.parseVariableAnnotations(document, text, signatures, results);

    return results.sort((a, b) => a.range.start.compareTo(b.range.start));
  }

  /** Parses every `def` signature and returns the offset span each one covers. */
  private parseSignatures(
    document: vscode.TextDocument,
    text: string,
    results: ParseResult[]
  ): Array<{ start: number; end: number }> {
    const pattern = new RegExp(PythonASTParser.DEF.source, 'g');
    const spans: Array<{ start: number; end: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const openParen = match.index + match[0].length - 1;
      const closeParen = this.matchingParen(text, openParen);
      if (closeParen === -1) {
        continue;
      }

      for (const param of this.splitTopLevel(text, openParen + 1, closeParen)) {
        this.pushAnnotation(document, text, param.start, param.end, results);
      }

      const statementEnd = this.findTopLevel(
        text,
        closeParen + 1,
        text.length,
        (char) => char === ':'
      );
      this.pushReturnAnnotation(document, text, closeParen + 1, statementEnd, results);

      spans.push({ start: openParen, end: statementEnd === -1 ? closeParen : statementEnd });
      pattern.lastIndex = closeParen;
    }

    return spans;
  }

  /** Emits the `: type` span of a single parameter, if it has one. */
  private pushAnnotation(
    document: vscode.TextDocument,
    text: string,
    start: number,
    end: number,
    results: ParseResult[]
  ): void {
    const colon = this.findTopLevel(text, start, end, (char) => char === ':');
    if (colon === -1) {
      return;
    }

    const defaultAt = this.findTopLevel(
      text,
      colon + 1,
      end,
      (char, next) => char === '=' && next !== '='
    );
    const annotationEnd = this.trimEnd(text, colon + 1, defaultAt === -1 ? end : defaultAt);
    if (annotationEnd <= colon + 1) {
      return;
    }

    this.push(document, text, colon, annotationEnd, results);
  }

  private pushReturnAnnotation(
    document: vscode.TextDocument,
    text: string,
    from: number,
    statementEnd: number,
    results: ParseResult[]
  ): void {
    if (statementEnd === -1) {
      return;
    }

    const arrow = text.indexOf('->', from);
    if (arrow === -1 || arrow > statementEnd) {
      return;
    }

    const end = this.trimEnd(text, arrow + 2, statementEnd);
    if (end > arrow + 2) {
      this.push(document, text, arrow, end, results);
    }
  }

  /**
   * PEP 526 annotations on their own statement. Lines inside a signature are
   * skipped: a wrapped parameter such as `    x: int,` looks exactly like a
   * variable annotation, and the signature pass has already reported it.
   */
  private parseVariableAnnotations(
    document: vscode.TextDocument,
    text: string,
    signatures: Array<{ start: number; end: number }>,
    results: ParseResult[]
  ): void {
    const lines = text.split('\n');
    let offset = 0;

    for (const line of lines) {
      const match = PythonASTParser.VARIABLE.exec(line);
      const insideSignature = signatures.some((span) => offset >= span.start && offset <= span.end);
      if (match && !insideSignature) {
        const colon = offset + match[1].length + match[2].length + match[3].length - 1;
        const end = offset + match[0].replace(/[ \t]*=?$/, '').length;
        if (end > colon + 1) {
          this.push(document, text, colon, end, results);
        }
      }
      offset += line.length + 1;
    }
  }

  private push(
    document: vscode.TextDocument,
    text: string,
    start: number,
    end: number,
    results: ParseResult[]
  ): void {
    const range = new vscode.Range(document.positionAt(start), document.positionAt(end));
    if (range.start.line !== range.end.line) {
      return;
    }
    results.push({ kind: 'type', key: '', value: text.slice(start, end), range });
  }

  /** Index of the `)` matching the `(` at `openIndex`, or -1. */
  private matchingParen(text: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
      const skip = this.skipString(text, i);
      if (skip !== i) {
        i = skip - 1;
        continue;
      }
      const char = text[i];
      if (char === '(' || char === '[' || char === '{') {
        depth++;
      } else if (char === ')' || char === ']' || char === '}') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  /** Splits `start..end` on top-level commas. */
  private splitTopLevel(
    text: string,
    start: number,
    end: number
  ): Array<{ start: number; end: number }> {
    const parts: Array<{ start: number; end: number }> = [];
    let partStart = start;
    let depth = 0;

    for (let i = start; i < end; i++) {
      const skip = this.skipString(text, i);
      if (skip !== i) {
        i = skip - 1;
        continue;
      }
      const char = text[i];
      if ('([{'.includes(char)) {
        depth++;
      } else if (')]}'.includes(char)) {
        depth--;
      } else if (char === ',' && depth === 0) {
        parts.push({ start: partStart, end: i });
        partStart = i + 1;
      }
    }
    if (partStart < end) {
      parts.push({ start: partStart, end });
    }
    return parts.filter((part) => text.slice(part.start, part.end).trim().length > 0);
  }

  /** First index in `start..end` where `predicate` holds outside brackets and strings. */
  private findTopLevel(
    text: string,
    start: number,
    end: number,
    predicate: (char: string, next: string) => boolean
  ): number {
    let depth = 0;

    for (let i = start; i < end; i++) {
      const skip = this.skipString(text, i);
      if (skip !== i) {
        i = skip - 1;
        continue;
      }
      const char = text[i];
      if ('([{'.includes(char)) {
        depth++;
      } else if (')]}'.includes(char)) {
        depth--;
      } else if (depth === 0 && predicate(char, text[i + 1] ?? '')) {
        return i;
      }
    }
    return -1;
  }

  /** If a string starts at `i`, the index just past it; otherwise `i`. */
  private skipString(text: string, i: number): number {
    const char = text[i];
    if (char !== '"' && char !== "'") {
      return i;
    }
    const triple = text.startsWith(char.repeat(3), i);
    const delimiter = triple ? char.repeat(3) : char;

    for (let j = i + delimiter.length; j < text.length; j++) {
      if (text[j] === '\\') {
        j++;
        continue;
      }
      if (!triple && text[j] === '\n') {
        return j;
      }
      if (text.startsWith(delimiter, j)) {
        return j + delimiter.length;
      }
    }
    return text.length;
  }

  private trimEnd(text: string, start: number, end: number): number {
    let trimmed = end;
    while (trimmed > start && /\s/.test(text[trimmed - 1])) {
      trimmed--;
    }
    return trimmed;
  }
}
