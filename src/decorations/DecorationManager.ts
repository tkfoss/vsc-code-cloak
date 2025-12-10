import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { EnvParser } from '../parsers/EnvParser';
import { JsonParser } from '../parsers/JsonParser';
import { YamlParser } from '../parsers/YamlParser';
import { TypeAnnotationParser } from '../parsers/TypeAnnotationParser';
import { ParseResult } from '../parsers/BaseParser';

export class DecorationManager {
  private decorationType: vscode.TextEditorDecorationType;

  constructor(private configManager: ConfigManager) {
    this.decorationType = this.createDecorationType();
  }

  private createDecorationType(): vscode.TextEditorDecorationType {
    const config = this.configManager.getConfig();
    const { style, backgroundColor, opacity } = config.appearance;

    let decorationOptions: vscode.DecorationRenderOptions = {};

    switch (style) {
      case 'blur':
        decorationOptions = {
          opacity: opacity.toString(),
          textDecoration: 'none; filter: blur(5px)',
        };
        break;
      case 'block':
        decorationOptions = {
          backgroundColor: backgroundColor === 'auto' ? 'var(--vscode-editor-selectionBackground)' : backgroundColor,
          color: backgroundColor === 'auto' ? 'var(--vscode-editor-selectionBackground)' : backgroundColor,
        };
        break;
      default:
        // For text replacement styles, completely hide the original text (including whitespace)
        // Using 'display: none' is the key - it removes the content from layout
        decorationOptions = {
          textDecoration: 'none; display: none;',
        };
    }

    return vscode.window.createTextEditorDecorationType(decorationOptions);
  }

  public updateDecorations(editor: vscode.TextEditor): void {
    if (!this.configManager.isEnabled()) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const document = editor.document;

    // Check if file is excluded
    if (this.configManager.isFileExcluded(document.fileName)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];

    // Parse secrets
    if (this.configManager.isSecretsHidden()) {
      const secretDecorations = this.parseSecrets(document);
      decorations.push(...secretDecorations);
    }

    // Parse type annotations
    if (this.configManager.isTypesHidden()) {
      const typeDecorations = this.parseTypes(document);
      decorations.push(...typeDecorations);
    }

    // Parse comments
    if (this.configManager.isCommentsHidden()) {
      const commentDecorations = this.parseComments(document);
      decorations.push(...commentDecorations);
    }

    // Parse docstrings
    if (this.configManager.isDocstringsHidden()) {
      const docstringDecorations = this.parseDocstrings(document);
      decorations.push(...docstringDecorations);
    }

    editor.setDecorations(this.decorationType, decorations);
  }

  private parseSecrets(document: vscode.TextDocument): vscode.DecorationOptions[] {
    const decorations: vscode.DecorationOptions[] = [];

    for (const parser of [new EnvParser(), new JsonParser(), new YamlParser()]) {
      if (parser.canParse(document)) {
        const results = parser.parse(document);
        for (const result of results) {
          if (this.configManager.shouldHideKey(result.key)) {
            decorations.push(this.createDecoration(result));
          }
        }
      }
    }

    return decorations;
  }

  private parseTypes(document: vscode.TextDocument): vscode.DecorationOptions[] {
    const decorations: vscode.DecorationOptions[] = [];
    const parser = new TypeAnnotationParser();

    if (parser.canParse(document)) {
      const results = parser.parse(document);
      for (const result of results) {
        decorations.push(this.createDecoration(result));
      }
    }

    return decorations;
  }

  private parseComments(_document: vscode.TextDocument): vscode.DecorationOptions[] {
    // Don't hide single-line comments - they should remain visible
    // Only multi-line block comments use folding (when hideBlockComments is enabled)
    return [];
  }

  private parseDocstrings(_document: vscode.TextDocument): vscode.DecorationOptions[] {
    // Don't use decorations for docstrings - use folding instead
    // Decorations would interfere with the folding display
    return [];
  }

  private createDecoration(result: ParseResult): vscode.DecorationOptions {
    const config = this.configManager.getConfig();
    const { style, hiddenText } = config.appearance;

    // Use a collapsed indicator instead of full replacement text
    let collapsedText = '⋯';
    let fullContentText = hiddenText;

    switch (style) {
      case 'dots':
        fullContentText = '•'.repeat(Math.min(result.value.length, 20));
        break;
      case 'stars':
        fullContentText = '*'.repeat(Math.min(result.value.length, 20));
        break;
      case 'scramble':
        fullContentText = this.scrambleText(result.value);
        break;
      case 'blur':
      case 'block':
        fullContentText = result.value; // Keep original for blur/block
        collapsedText = result.value; // No collapse for blur/block
        break;
    }

    const decoration: vscode.DecorationOptions = {
      range: result.range,
    };

    // For text replacement styles, show minimal collapsed indicator
    if (style !== 'blur' && style !== 'block') {
      decoration.renderOptions = {
        before: {
          contentText: collapsedText,
          color: config.appearance.textColor === 'auto' ? 'var(--vscode-editorCodeLens-foreground)' : config.appearance.textColor,
          fontStyle: 'italic',
        },
      };
    }

    // Build comprehensive hover message with full replacement text
    let hoverMessage = `**${config.hover.message}**`;

    if (style !== 'blur' && style !== 'block') {
      hoverMessage += `\n\nShowing as: \`${collapsedText}\` (hover to see full)`;
      hoverMessage += `\n\nFull replacement: \`${fullContentText}\``;
    }

    if (config.hover.showPreview) {
      hoverMessage += `\n\nOriginal: \`${result.value}\``;
    }

    decoration.hoverMessage = hoverMessage;

    return decoration;
  }

  private scrambleText(text: string): string {
    const chars = text.split('');
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  public refreshAllDecorations(): void {
    // Recreate decoration type with new config
    this.decorationType.dispose();
    this.decorationType = this.createDecorationType();

    // Update all visible editors
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.updateDecorations(editor);
    });
  }

  public dispose(): void {
    this.decorationType.dispose();
  }
}
