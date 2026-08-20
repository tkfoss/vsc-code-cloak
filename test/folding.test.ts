import * as vscode from 'vscode';
import { ConfigManager } from '../src/config/ConfigManager';
import { CloakFoldingRangeProvider } from '../src/folding/FoldingProvider';
import { makeDocument } from './helpers';
import { settings } from './vscode';

function setup(values: Record<string, unknown> = {}): CloakFoldingRangeProvider {
  settings.clear();
  settings.set('codeCloak.features.comments', true);
  settings.set('codeCloak.features.docstrings', true);
  for (const [key, value] of Object.entries(values)) {
    settings.set(`codeCloak.${key}`, value);
  }
  return new CloakFoldingRangeProvider(new ConfigManager());
}

/** The [startLine, endLine] pairs a document folds into. */
const spans = (
  provider: CloakFoldingRangeProvider,
  document: vscode.TextDocument
): Array<[number, number]> =>
  provider.foldableRanges(document).map(({ range }) => [range.start.line, range.end.line]);

describe('folding regions', () => {
  it('folds a multi-line block comment as one region', () => {
    const document = makeDocument(
      ['/**', ' * Settles an invoice.', ' */', 'const x = 1;'].join('\n'),
      'service.ts'
    );
    expect(spans(setup(), document)).toEqual([[0, 2]]);
  });

  it('folds a multi-line docstring as one region', () => {
    const document = makeDocument(
      ['def run():', '    """Applies the', '    secret rules."""', '    return 1'].join('\n'),
      'pipeline.py'
    );
    expect(spans(setup(), document)).toEqual([[1, 2]]);
  });

  it('groups a run of consecutive whole-line comments into one region', () => {
    const document = makeDocument(
      ['// first', '// second', '// third', 'const x = 1;'].join('\n'),
      'notes.ts'
    );
    expect(spans(setup(), document)).toEqual([[0, 2]]);
  });

  it('splits runs that are broken by code', () => {
    const document = makeDocument(
      ['// a', '// b', 'const x = 1;', '// c', '// d'].join('\n'),
      'notes.ts'
    );
    expect(spans(setup(), document)).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });

  it('never folds a comment trailing code, which would hide the code with it', () => {
    const document = makeDocument(
      ['const x = 1; // trailing', 'const y = 2; // trailing'].join('\n'),
      'notes.ts'
    );
    expect(spans(setup(), document)).toEqual([]);
  });

  it('leaves a lone comment line alone', () => {
    const document = makeDocument(['// only one', 'const x = 1;'].join('\n'), 'notes.ts');
    expect(spans(setup(), document)).toEqual([]);
  });

  it('honours a raised minimum run length', () => {
    const document = makeDocument(['// a', '// b', '', '// c', '// d', '// e'].join('\n'), 'n.ts');
    expect(spans(setup({ 'folding.minimumLines': 3 }), document)).toEqual([[3, 5]]);
  });

  it('offers nothing when folding is turned off', () => {
    const document = makeDocument(['// a', '// b'].join('\n'), 'notes.ts');
    expect(spans(setup({ 'folding.enabled': false }), document)).toEqual([]);
  });

  it('keeps multi-line regions when inline run folding is turned off', () => {
    const document = makeDocument(
      ['// a', '// b', '/*', ' * block', ' */'].join('\n'),
      'notes.ts'
    );
    expect(spans(setup({ 'folding.inline': false }), document)).toEqual([[2, 4]]);
  });

  it('offers nothing for a feature that is disabled entirely', () => {
    const document = makeDocument(['// a', '// b'].join('\n'), 'notes.ts');
    expect(spans(setup({ 'features.comments': false }), document)).toEqual([]);
  });

  it('reports regions in document order', () => {
    const document = makeDocument(
      ['/*', ' * block', ' */', 'const x = 1;', '// a', '// b'].join('\n'),
      'notes.ts'
    );
    expect(spans(setup(), document)).toEqual([
      [0, 2],
      [4, 5],
    ]);
  });

  describe('blank lines beneath a region', () => {
    const source = ['/*', ' * block', ' */', '', '', 'const x = 1;'].join('\n');

    it('are absorbed into the fold, so collapsing leaves no gap', () => {
      expect(spans(setup(), makeDocument(source, 'a.ts'))).toEqual([[0, 4]]);
    });

    it('are left alone when trimming is turned off', () => {
      expect(spans(setup({ 'folding.trimBlankLines': false }), makeDocument(source, 'a.ts'))).toEqual(
        [[0, 2]]
      );
    });

    it('never grow one region into the next', () => {
      const document = makeDocument(
        ['// a', '// b', '', '// c', '// d'].join('\n'),
        'a.ts'
      );
      expect(spans(setup(), document)).toEqual([
        [0, 2],
        [3, 4],
      ]);
    });

    it('stop at the end of the document', () => {
      const document = makeDocument(['// a', '// b', '', ''].join('\n'), 'a.ts');
      const [[, end]] = spans(setup(), document);
      expect(end).toBeLessThan(document.lineCount);
    });
  });

  it('provides no ranges while the extension is disabled', () => {
    const provider = setup({ enabled: false });
    const document = makeDocument(['// a', '// b'].join('\n'), 'notes.ts');
    const ranges = provider.provideFoldingRanges(
      document,
      {} as vscode.FoldingContext,
      { isCancellationRequested: false } as vscode.CancellationToken
    );
    expect(ranges).toEqual([]);
  });
});
