import * as vscode from 'vscode';
import { CloakStyle, ConfigManager } from '../config/ConfigManager';
import { BaseParser, ParseResult } from '../parsers/BaseParser';
import { EnvParser } from '../parsers/EnvParser';
import { JsonParser } from '../parsers/JsonParser';
import { YamlParser } from '../parsers/YamlParser';
import { PropertiesParser } from '../parsers/PropertiesParser';
import { TypeAnnotationParser } from '../parsers/TypeAnnotationParser';
import { CommentParser } from '../parsers/CommentParser';
import { DocstringParser } from '../parsers/DocstringParser';

/** Longest mask a repeating style will draw, so one long value cannot flood the line. */
const MAX_MASK_LENGTH = 20;

interface CacheEntry {
  version: number;
  revision: number;
  decorations: vscode.DecorationOptions[];
}

/** One line's worth of masking, after multi-line regions have been split up. */
interface MaskTarget extends ParseResult {
  /** A second or later line of a region already marked on its opening line. */
  continuation: boolean;
  /** Nothing but whitespace shares the line, so no code alignment is at stake. */
  ownsLine: boolean;
}

/**
 * Turns parse results into editor decorations.
 *
 * Masking works by hiding the original range with `display: none` and drawing
 * the replacement as a `before` pseudo-element, which is the only way a
 * decoration can change what a line looks like without editing the document.
 * `blur` and `block` instead paint over the text in place, so they keep the
 * original glyph metrics and reveal the value's length.
 */
export class DecorationManager {
  private decorationType: vscode.TextEditorDecorationType;
  private readonly cache = new Map<string, CacheEntry>();
  /** Lines the user has explicitly revealed, per document. */
  private readonly revealed = new Map<string, Set<number>>();

  private readonly secretParsers: BaseParser[] = [
    new EnvParser(),
    new JsonParser(),
    new YamlParser(),
    new PropertiesParser(),
  ];
  private readonly typeParser = new TypeAnnotationParser();
  private readonly commentParser = new CommentParser();
  private readonly docstringParser = new DocstringParser();

  /** Signature of the appearance settings baked into the current decoration type. */
  private appearanceKey: string;

  constructor(private readonly configManager: ConfigManager) {
    this.decorationType = this.createDecorationType();
    this.appearanceKey = this.appearanceSignature();
  }

  /**
   * Only the settings `createDecorationType` bakes in. Colour and replacement
   * text are per-decoration render options, so changing those does not need a
   * new type.
   */
  private appearanceSignature(): string {
    const { style, backgroundColor, opacity } = this.configManager.getConfig().appearance;
    return `${style}|${backgroundColor}|${opacity}`;
  }

  private createDecorationType(): vscode.TextEditorDecorationType {
    const { style, backgroundColor, opacity } = this.configManager.getConfig().appearance;

    switch (style) {
      case 'blur':
        return vscode.window.createTextEditorDecorationType({
          opacity: opacity.toString(),
          textDecoration: 'none; filter: blur(5px)',
        });
      case 'block': {
        const color =
          backgroundColor === 'auto' ? 'var(--vscode-editor-selectionBackground)' : backgroundColor;
        return vscode.window.createTextEditorDecorationType({ backgroundColor: color, color });
      }
      default:
        // `display: none` removes the original text from layout entirely, so the
        // replacement drawn by `before` does not sit next to the real value.
        return vscode.window.createTextEditorDecorationType({
          textDecoration: 'none; display: none;',
        });
    }
  }

  public updateDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decorationType, this.decorationsFor(editor.document));
  }

  /** Re-renders every editor currently showing `document`. */
  public updateDocument(document: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === document) {
        this.updateDecorations(editor);
      }
    }
  }

  /**
   * Re-renders every visible editor. The decoration type is rebuilt only when
   * the settings baked into it changed: disposing one drops its decorations
   * from every editor at once, which flickers the masks off and back on for
   * what is usually just a hide/show toggle.
   */
  public refreshAllDecorations(): void {
    const signature = this.appearanceSignature();
    if (signature !== this.appearanceKey) {
      this.decorationType.dispose();
      this.decorationType = this.createDecorationType();
      this.appearanceKey = signature;
    }

    this.cache.clear();
    vscode.window.visibleTextEditors.forEach((editor) => this.updateDecorations(editor));
  }

  private decorationsFor(document: vscode.TextDocument): vscode.DecorationOptions[] {
    const key = document.uri.toString();
    const revision = this.configManager.getRevision();
    const cached = this.cache.get(key);

    if (cached && cached.version === document.version && cached.revision === revision) {
      return cached.decorations;
    }

    const decorations = this.buildDecorations(document);
    this.cache.set(key, { version: document.version, revision, decorations });
    return decorations;
  }

  private buildDecorations(document: vscode.TextDocument): vscode.DecorationOptions[] {
    if (!this.configManager.isEnabled() || this.configManager.isFileExcluded(document.fileName)) {
      return [];
    }

    const results = this.toSingleLines(document, [
      ...this.parseSecrets(document),
      ...this.parseTypes(document),
      ...this.parseComments(document),
      ...this.parseDocstrings(document),
    ]);

    const revealed = this.revealed.get(document.uri.toString());
    return results
      .filter((result) => !revealed?.has(result.range.start.line))
      .map((result) => this.createDecoration(result));
  }

  /**
   * Splits a multi-line result into one target per line.
   *
   * A decoration cannot mask across a line break, so these used to be dropped
   * and left entirely to the folding layer. That leaked: a fold shows its
   * opening line, so the first line of a collapsed docstring stayed on screen
   * in the clear, and with folding turned off nothing was masked at all.
   * Masking every line covers both cases -- the lines a fold hides are simply
   * never rendered.
   *
   * Only the opening line carries the marker. Repeating it down the block drew
   * a slab of identical placeholders that read as damage rather than as one
   * hidden thing; the rest of the lines are hidden and left blank.
   */
  private toSingleLines(document: vscode.TextDocument, results: ParseResult[]): MaskTarget[] {
    const split: MaskTarget[] = [];

    for (const result of results) {
      if (result.range.start.line === result.range.end.line) {
        split.push({
          ...result,
          continuation: false,
          ownsLine: this.ownsLine(document, result.range),
        });
        continue;
      }

      let marked = false;

      for (let line = result.range.start.line; line <= result.range.end.line; line++) {
        const text = document.lineAt(line).text;
        // Continuation lines start at the indent so the block keeps its shape.
        const from =
          line === result.range.start.line
            ? result.range.start.character
            : text.length - text.trimStart().length;
        const to = line === result.range.end.line ? result.range.end.character : text.length;

        if (to <= from) {
          continue; // Blank line inside the block: nothing to mask.
        }

        const range = this.lineRange(line, from, to);
        split.push({
          kind: result.kind,
          key: result.key,
          value: text.slice(from, to),
          range,
          continuation: marked,
          ownsLine: this.ownsLine(document, range),
        });
        marked = true;
      }
    }

    return split;
  }

  private lineRange(line: number, from: number, to: number): vscode.Range {
    return new vscode.Range(new vscode.Position(line, from), new vscode.Position(line, to));
  }

  /** True when only whitespace precedes and follows the range on its line. */
  private ownsLine(document: vscode.TextDocument, range: vscode.Range): boolean {
    const text = document.lineAt(range.start.line).text;
    return (
      text.slice(0, range.start.character).trim() === '' &&
      text.slice(range.end.character).trim() === ''
    );
  }

  private parseSecrets(document: vscode.TextDocument): ParseResult[] {
    if (
      !this.configManager.isHidden('secrets') ||
      !this.configManager.matchesSecretFilePattern(document.fileName)
    ) {
      return [];
    }

    const parser = this.secretParsers.find((candidate) => candidate.canParse(document));
    if (!parser) {
      return [];
    }

    return parser.parse(document).filter((result) => this.configManager.shouldHideKey(result.key));
  }

  private parseTypes(document: vscode.TextDocument): ParseResult[] {
    if (
      !this.configManager.isHidden('types') ||
      !this.configManager.isLanguageEnabled('types', document.languageId) ||
      !this.typeParser.canParse(document)
    ) {
      return [];
    }
    return this.typeParser.parse(document);
  }

  /**
   * Comments honour the two independent `codeCloak.comments.*` settings.
   * Multi-line blocks are masked line by line; the folding layer additionally
   * collapses them when it is on.
   */
  private parseComments(document: vscode.TextDocument): ParseResult[] {
    if (!this.configManager.isHidden('comments')) {
      return [];
    }

    const { hideLineComments, hideBlockComments } = this.configManager.getConfig().comments;
    return this.commentParser
      .parse(document)
      .filter((result) => (result.key === 'line' ? hideLineComments : hideBlockComments));
  }

  private parseDocstrings(document: vscode.TextDocument): ParseResult[] {
    if (
      !this.configManager.isHidden('docstrings') ||
      !this.configManager.isLanguageEnabled('docstrings', document.languageId) ||
      !this.docstringParser.canParse(document)
    ) {
      return [];
    }
    return this.docstringParser.parse(document);
  }

  private createDecoration(result: MaskTarget): vscode.DecorationOptions {
    const config = this.configManager.getConfig();
    const { style, textColor } = config.appearance;
    const decoration: vscode.DecorationOptions = { range: result.range };

    if (style !== 'blur' && style !== 'block') {
      decoration.renderOptions = {
        before: {
          // A continuation line is hidden but not re-marked: one region, one marker.
          contentText: result.continuation ? '' : this.maskFor(result, style),
          color: textColor === 'auto' ? 'var(--vscode-editorCodeLens-foreground)' : textColor,
          fontStyle: 'italic',
        },
      };
    }

    const hover = new vscode.MarkdownString(`**${config.hover.message}**`);
    if (config.hover.showPreview) {
      hover.appendMarkdown('\n\n');
      hover.appendCodeblock(result.value);
    }
    decoration.hoverMessage = hover;

    return decoration;
  }

  /**
   * `compact` shrinks the mask only where it would otherwise distort code.
   *
   * Width matters when the mask shares its line: replacing `: string` with
   * `***HIDDEN***` makes the line longer than the code it hides and a file of
   * annotations stops lining up, so those collapse to one glyph. A mask that
   * owns its line has no alignment to protect, and one glyph on an otherwise
   * empty row is indistinguishable from a blank line -- there is no way to tell
   * whether something is hidden there. Those keep the descriptive marker.
   */
  private maskFor(target: MaskTarget, style: CloakStyle): string {
    const { hiddenText, compactText } = this.configManager.getConfig().appearance;
    const width = Math.min(target.value.length, MAX_MASK_LENGTH);

    switch (style) {
      case 'dots':
        return '•'.repeat(width);
      case 'stars':
        return '*'.repeat(width);
      case 'scramble':
        return this.scramble(target.value);
      case 'compact':
        return target.ownsLine ? hiddenText : compactText;
      default:
        return hiddenText;
    }
  }

  /**
   * Deterministic shuffle: the same value always scrambles the same way, so the
   * masked text does not resample on every keystroke and flicker on screen.
   */
  private scramble(text: string): string {
    const chars = text.split('');
    let seed = 0;
    for (const char of text) {
      seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    }

    for (let i = chars.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  /**
   * The key of the secret at `position`, used by the "add to exclude list"
   * command. Ignores the hidden state so the key can be looked up whether or
   * not it is currently masked.
   */
  public secretKeyAt(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    const parser = this.secretParsers.find((candidate) => candidate.canParse(document));
    const results = parser?.parse(document) ?? [];
    const onLine = results.filter((result) => result.range.start.line === position.line);
    return (onLine.find((result) => result.range.contains(position)) ?? onLine[0])?.key;
  }

  /** Toggles the cloak on the lines touched by the current selection. */
  public toggleLines(editor: vscode.TextEditor, lines: number[]): void {
    const key = editor.document.uri.toString();
    const revealed = this.revealed.get(key) ?? new Set<number>();

    for (const line of lines) {
      if (revealed.has(line)) {
        revealed.delete(line);
      } else {
        revealed.add(line);
      }
    }

    this.revealed.set(key, revealed);
    this.cache.delete(key);
    this.updateDecorations(editor);
  }

  /**
   * Keeps revealed lines pointing at the lines the user actually revealed.
   *
   * Reveals are stored as bare line numbers, so inserting or deleting lines
   * above one used to slide it onto a different line and uncloak a value
   * nobody asked to see. A line removed by the edit drops its reveal outright
   * rather than transferring it to whatever takes its place.
   */
  public shiftRevealedLines(event: vscode.TextDocumentChangeEvent): void {
    const key = event.document.uri.toString();
    const revealed = this.revealed.get(key);
    if (!revealed?.size) {
      return;
    }

    let lines = [...revealed];

    for (const change of event.contentChanges) {
      const { start, end } = change.range;
      const delta = change.text.split('\n').length - 1 - (end.line - start.line);

      lines = lines.flatMap((line) => {
        if (line <= start.line) {
          return [line];
        }
        if (line <= end.line) {
          return [];
        }
        return [line + delta];
      });
    }

    this.revealed.set(key, new Set(lines));
    this.cache.delete(key);
  }

  public clearRevealedLines(): void {
    this.revealed.clear();
    this.cache.clear();
  }

  public forget(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    this.cache.delete(key);
    this.revealed.delete(key);
  }

  public dispose(): void {
    this.decorationType.dispose();
    this.cache.clear();
    this.revealed.clear();
  }
}
