import * as vscode from 'vscode';
import { ConfigManager } from '../src/config/ConfigManager';
import { DecorationManager } from '../src/decorations/DecorationManager';
import { makeDocument, textOf } from './helpers';
import { settings, workspace } from './vscode';

interface FakeEditor {
  document: vscode.TextDocument;
  setDecorations: jest.Mock;
}

function config(values: Record<string, unknown> = {}): ConfigManager {
  settings.clear();
  workspace.workspaceFolders = undefined;
  // `loadConfig` falls back to empty arrays; the real defaults come from the
  // manifest, which the fake `getConfiguration` does not read.
  settings.set('codeCloak.secrets.filePatterns', ['.env*', '*.json', '*.yaml']);
  settings.set('codeCloak.secrets.keyPatterns', ['*KEY*', '*SECRET*', '*PASSWORD*']);
  for (const [key, value] of Object.entries(values)) {
    settings.set(`codeCloak.${key}`, value);
  }
  return new ConfigManager();
}

function render(
  manager: DecorationManager,
  document: vscode.TextDocument
): vscode.DecorationOptions[] {
  const editor: FakeEditor = { document, setDecorations: jest.fn() };
  manager.updateDecorations(editor as unknown as vscode.TextEditor);
  return editor.setDecorations.mock.calls[0][1];
}

/**
 * A fold shows its opening line, so a multi-line region that is only folded
 * still puts its first line on screen. These cover the masking that has to sit
 * underneath the fold.
 */
describe('multi-line regions are masked line by line', () => {
  const source = ['def run():', '    """Applies the', '    secret rules."""', '    return 1'].join(
    '\n'
  );

  it('masks every line of a docstring, including the one a fold leaves visible', () => {
    const manager = new DecorationManager(config({ 'features.docstrings': true }));
    const document = makeDocument(source, 'pipeline.py');
    const decorations = render(manager, document);

    expect(decorations.map((d) => d.range.start.line)).toEqual([1, 2]);
    expect(textOf(document, decorations[0].range)).toBe('"""Applies the');
    expect(textOf(document, decorations[1].range)).toBe('secret rules."""');
  });

  it('masks every line of a block comment', () => {
    const manager = new DecorationManager(config({ 'features.comments': true }));
    const document = makeDocument(['/**', ' * Secret note.', ' */'].join('\n'), 'a.ts');
    const decorations = render(manager, document);

    expect(decorations.map((d) => d.range.start.line)).toEqual([0, 1, 2]);
  });

  it('leaves the indent of a continuation line visible so the block keeps its shape', () => {
    const manager = new DecorationManager(config({ 'features.docstrings': true }));
    const document = makeDocument(source, 'pipeline.py');
    expect(render(manager, document)[1].range.start.character).toBe(4);
  });

  it('skips blank lines inside a block, which have nothing to mask', () => {
    const manager = new DecorationManager(config({ 'features.comments': true }));
    const document = makeDocument(['/*', '', ' * note', '', ' */'].join('\n'), 'a.ts');
    expect(render(manager, document).map((d) => d.range.start.line)).toEqual([0, 2, 4]);
  });
});

describe('revealed lines survive edits above them', () => {
  const document = makeDocument(['A=1', 'API_KEY=secret', 'B=2'].join('\n'), '/app/.env');

  function reveal(manager: DecorationManager, line: number): void {
    const editor: FakeEditor = { document, setDecorations: jest.fn() };
    manager.toggleLines(editor as unknown as vscode.TextEditor, [line]);
  }

  function insertLines(
    manager: DecorationManager,
    atLine: number,
    count: number
  ): void {
    manager.shiftRevealedLines({
      document,
      contentChanges: [
        {
          range: new vscode.Range(
            new vscode.Position(atLine, 0),
            new vscode.Position(atLine, 0)
          ),
          text: '\n'.repeat(count),
        },
      ],
    } as unknown as vscode.TextDocumentChangeEvent);
  }

  it('moves the reveal with the line when lines are inserted above it', () => {
    const manager = new DecorationManager(config());
    reveal(manager, 1);
    expect(render(manager, document)).toHaveLength(0);

    insertLines(manager, 0, 2);

    // The reveal followed the secret to line 3, so line 1 is masked again.
    expect(render(manager, document).map((d) => d.range.start.line)).toEqual([1]);
  });

  it('drops a reveal whose line was deleted rather than passing it to a new one', () => {
    const manager = new DecorationManager(config());
    reveal(manager, 1);

    manager.shiftRevealedLines({
      document,
      contentChanges: [
        {
          range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(2, 0)),
          text: '',
        },
      ],
    } as unknown as vscode.TextDocumentChangeEvent);

    expect(render(manager, document).map((d) => d.range.start.line)).toEqual([1]);
  });
});

describe('excluded file paths', () => {
  it('stores a path relative to the workspace that gives it meaning', async () => {
    const manager = config();
    workspace.workspaceFolders = [{ uri: { fsPath: '/repo' } }];

    await manager.excludeFile('/repo/src/config.json');

    expect(settings.get('codeCloak.files.excluded')).toEqual(['src/config.json']);
  });

  it('matches a relative entry against a full path', () => {
    const manager = config({ 'files.excluded': ['src/config.json'] });
    expect(manager.isFileExcluded('/anywhere/src/config.json')).toBe(true);
    expect(manager.isFileExcluded('/anywhere/other/config.json')).toBe(false);
  });

  it('keeps absolute paths when there is no workspace to relate them to', async () => {
    const manager = config();
    await manager.excludeFile('/tmp/loose.env');
    expect(settings.get('codeCloak.files.excluded')).toEqual(['/tmp/loose.env']);
  });

  it('does not add a file that is already excluded under another spelling', async () => {
    const manager = config({ 'files.excluded': ['src/config.json'] });
    workspace.workspaceFolders = [{ uri: { fsPath: '/repo' } }];

    await manager.excludeFile('/repo/src/config.json');

    expect(manager.getConfig().files.excluded).toEqual(['src/config.json']);
  });

  it('excludes everything beneath a bare directory entry', () => {
    const manager = config({ 'files.excluded': ['secrets'] });
    expect(manager.isFileExcluded('/repo/secrets/prod.env')).toBe(true);
    expect(manager.isFileExcluded('/repo/public/prod.env')).toBe(false);
  });
});

/**
 * The `compact` style shrinks a mask only where it shares its line with code.
 * Inline, width distorts the code around it; on a line of its own there is no
 * alignment to protect and a lone glyph is indistinguishable from a blank line.
 */
describe('the compact style', () => {
  const inline = 'const result: Promise<Record<string, Invoice>> = load();';

  function masks(style: string, source: string, extra: Record<string, unknown> = {}) {
    const manager = new DecorationManager(
      config({ 'appearance.style': style, 'features.types': true, 'features.comments': true, 'features.docstrings': true, ...extra })
    );
    return render(manager, makeDocument(source, 'a.ts')).map(
      (d) => d.renderOptions?.before?.contentText
    );
  }

  describe('where the mask shares its line with code', () => {
    it('draws exactly one glyph however long the annotation is', () => {
      expect(masks('compact', inline)).toEqual(['•']);
    });

    it('uses a configurable glyph', () => {
      expect(masks('compact', inline, { 'appearance.compactText': '…' })).toEqual(['…']);
    });

    it('is narrower than the styles that scale with the hidden text', () => {
      const [compact] = masks('compact', inline);
      const [stars] = masks('stars', inline);
      const [text] = masks('text', inline);

      expect(compact).toHaveLength(1);
      expect(stars!.length).toBeGreaterThan(compact!.length);
      expect(text!.length).toBeGreaterThan(compact!.length);
    });

    it('shrinks a comment trailing code, which cannot be folded away', () => {
      expect(masks('compact', 'return ok; // a note')).toEqual(['•']);
    });

    it('draws nothing at all when the glyph is set to an empty string', () => {
      expect(masks('compact', inline, { 'appearance.compactText': '' })).toEqual(['']);
    });

    it('still marks a whole-line mask when the inline glyph is empty', () => {
      const source = ['def run():', '    """Applies the rules."""'].join('\n');
      const manager = new DecorationManager(
        config({
          'appearance.style': 'compact',
          'appearance.compactText': '',
          'features.docstrings': true,
        })
      );
      expect(
        render(manager, makeDocument(source, 'p.py')).map(
          (d) => d.renderOptions?.before?.contentText
        )
      ).toEqual(['***HIDDEN***']);
    });
  });

  describe('where the mask owns its line', () => {
    it('keeps the descriptive marker so the row is not mistaken for a blank line', () => {
      const source = ['def run():', '    """Applies the rules."""', '    return 1'].join('\n');
      const manager = new DecorationManager(
        config({ 'appearance.style': 'compact', 'features.docstrings': true })
      );
      expect(
        render(manager, makeDocument(source, 'p.py')).map(
          (d) => d.renderOptions?.before?.contentText
        )
      ).toEqual(['***HIDDEN***']);
    });

    it('treats an indented whole-line comment as owning its line', () => {
      expect(masks('compact', 'function f() {\n  // a note\n}')).toEqual(['***HIDDEN***']);
    });

    it('marks a multi-line region once and leaves its other lines blank', () => {
      const drawn = masks('compact', ['/*', ' * one', ' * two', ' */'].join('\n'));
      expect(drawn).toEqual(['***HIDDEN***', '', '', '']);
    });
  });
});
