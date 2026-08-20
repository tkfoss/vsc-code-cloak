import * as vscode from 'vscode';
import { CloakFeature, ConfigManager } from '../config/ConfigManager';
import { DocstringParser } from '../parsers/DocstringParser';
import { CommentParser } from '../parsers/CommentParser';
import { ParseResult } from '../parsers/BaseParser';

/** A foldable range tagged with the feature that owns it. */
export type FoldableFeature = Extract<CloakFeature, 'comments' | 'docstrings'>;

export interface FoldableRange {
  range: vscode.Range;
  feature: FoldableFeature;
}

/**
 * Contributes folding ranges for the prose the cloak wants off the screen.
 *
 * Two shapes qualify. A single construct spanning several lines -- a block
 * comment or a docstring -- folds as itself. A run of consecutive whole-line
 * comments folds as one region, which is the only way the line-comment banner
 * above a function collapses to a single row instead of a stack of masks.
 *
 * Folding is strictly line-based in VS Code, so a comment trailing real code is
 * never foldable: collapsing its line would take the code with it. Those stay
 * with the decoration layer, which can mask part of a line.
 *
 * Ranges are offered whenever the feature is enabled -- not only while it is
 * hidden -- so the user can still fold and unfold them by hand after revealing.
 */
export class CloakFoldingRangeProvider implements vscode.FoldingRangeProvider {
  private readonly docstringParser = new DocstringParser();
  private readonly commentParser = new CommentParser();

  constructor(private readonly configManager: ConfigManager) {}

  provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    if (!this.configManager.isEnabled() || token.isCancellationRequested) {
      return [];
    }

    return this.foldableRanges(document).map(
      ({ range }) =>
        new vscode.FoldingRange(range.start.line, range.end.line, vscode.FoldingRangeKind.Comment)
    );
  }

  /** Every region enabled for this document, in document order. */
  public foldableRanges(document: vscode.TextDocument): FoldableRange[] {
    if (!this.configManager.isFoldingEnabled()) {
      return [];
    }

    const ranges: FoldableRange[] = [];
    const config = this.configManager.getConfig();

    if (
      this.configManager.isFeatureEnabled('docstrings') &&
      this.configManager.isLanguageEnabled('docstrings', document.languageId) &&
      this.docstringParser.canParse(document)
    ) {
      ranges.push(...this.multiLine(this.docstringParser.parse(document), 'docstrings'));
    }

    if (this.configManager.isFeatureEnabled('comments')) {
      const comments = this.commentParser.parse(document);

      if (config.comments.hideBlockComments) {
        ranges.push(
          ...this.multiLine(
            comments.filter((result) => result.key === 'block'),
            'comments'
          )
        );
      }

      if (config.folding.inline && config.comments.hideLineComments) {
        ranges.push(...this.lineCommentRuns(document, comments));
      }
    }

    const ordered = ranges.sort((a, b) => a.range.start.line - b.range.start.line);
    return this.configManager.getConfig().folding.trimBlankLines
      ? this.absorbTrailingBlankLines(document, ordered)
      : ordered;
  }

  /**
   * Extends each region over the blank lines directly beneath it.
   *
   * Collapsing a docstring otherwise leaves the blank line that separated it
   * from the code behind as a gap, so the space the fold was meant to reclaim
   * comes straight back. Blank lines carry nothing, so swallowing them into the
   * fold above costs nothing -- and a region never grows into the next one.
   */
  private absorbTrailingBlankLines(
    document: vscode.TextDocument,
    ranges: FoldableRange[]
  ): FoldableRange[] {
    return ranges.map((entry, index) => {
      const limit = ranges[index + 1]?.range.start.line ?? document.lineCount;
      let end = entry.range.end.line;

      while (end + 1 < limit && document.lineAt(end + 1).text.trim() === '') {
        end++;
      }

      if (end === entry.range.end.line) {
        return entry;
      }
      return {
        ...entry,
        range: new vscode.Range(
          entry.range.start,
          new vscode.Position(end, document.lineAt(end).text.length)
        ),
      };
    });
  }

  private multiLine(results: ParseResult[], feature: FoldableFeature): FoldableRange[] {
    const minimum = this.configManager.getConfig().folding.minimumLines;

    return results
      .filter((result) => result.range.end.line - result.range.start.line + 1 >= minimum)
      .map((result) => ({ range: result.range, feature }));
  }

  /**
   * Groups consecutive whole-line comments into one region each.
   *
   * Only comments that own their line take part. A trailing comment is dropped
   * rather than merged, since a run containing one would fold away the code it
   * sits beside.
   */
  private lineCommentRuns(
    document: vscode.TextDocument,
    comments: ParseResult[]
  ): FoldableRange[] {
    const minimum = this.configManager.getConfig().folding.minimumLines;
    const lines = comments
      .filter((result) => result.key === 'line' && result.range.isSingleLine)
      .filter((result) => this.ownsItsLine(document, result))
      .map((result) => result.range.start.line);

    const runs: FoldableRange[] = [];
    let start: number | null = null;
    let previous: number | null = null;

    const flush = (end: number): void => {
      if (start !== null && end - start + 1 >= minimum) {
        runs.push({
          range: new vscode.Range(
            new vscode.Position(start, 0),
            new vscode.Position(end, document.lineAt(end).text.length)
          ),
          feature: 'comments',
        });
      }
    };

    for (const line of lines) {
      if (previous !== null && line === previous + 1) {
        previous = line;
        continue;
      }
      if (previous !== null) {
        flush(previous);
      }
      start = line;
      previous = line;
    }
    if (previous !== null) {
      flush(previous);
    }

    return runs;
  }

  /** True when nothing but whitespace precedes the comment on its line. */
  private ownsItsLine(document: vscode.TextDocument, result: ParseResult): boolean {
    const text = document.lineAt(result.range.start.line).text;
    return text.slice(0, result.range.start.character).trim() === '';
  }
}
