import * as vscode from 'vscode';
import { ConfigManager } from '../src/config/ConfigManager';
import { DecorationManager } from '../src/decorations/DecorationManager';
import { makeDocument } from './helpers';
import { settings } from './vscode';

interface FakeEditor {
  document: vscode.TextDocument;
  setDecorations: jest.Mock;
}

function setup(values: Record<string, unknown> = {}): ConfigManager {
  settings.clear();
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
): { editor: FakeEditor; decorations: vscode.DecorationOptions[] } {
  const editor: FakeEditor = { document, setDecorations: jest.fn() };
  manager.updateDecorations(editor as unknown as vscode.TextEditor);
  return { editor, decorations: editor.setDecorations.mock.calls[0][1] };
}

const contentTextOf = (decoration: vscode.DecorationOptions): string | undefined =>
  decoration.renderOptions?.before?.contentText;

describe('DecorationManager masking', () => {
  const document = makeDocument('API_KEY=sk-123456', '/app/.env');

  it('draws the configured replacement text', () => {
    const manager = new DecorationManager(setup({ 'appearance.style': 'text' }));
    const { decorations } = render(manager, document);
    expect(decorations).toHaveLength(1);
    expect(contentTextOf(decorations[0])).toBe('***HIDDEN***');
  });

  it('draws one mask character per hidden character', () => {
    const stars = new DecorationManager(setup({ 'appearance.style': 'stars' }));
    expect(contentTextOf(render(stars, document).decorations[0])).toBe('*'.repeat(9));

    const dots = new DecorationManager(setup({ 'appearance.style': 'dots' }));
    expect(contentTextOf(render(dots, document).decorations[0])).toBe('•'.repeat(9));
  });

  it('caps the mask so one long value cannot flood the line', () => {
    const manager = new DecorationManager(setup({ 'appearance.style': 'stars' }));
    const long = makeDocument(`API_KEY=${'x'.repeat(500)}`, '/app/.env');
    expect(contentTextOf(render(manager, long).decorations[0])).toHaveLength(20);
  });

  it('scrambles deterministically so the mask does not flicker while typing', () => {
    const manager = new DecorationManager(setup({ 'appearance.style': 'scramble' }));
    const first = contentTextOf(render(manager, document).decorations[0]);
    const second = contentTextOf(
      render(manager, makeDocument(document.getText(), '/app/.env')).decorations[0]
    );

    expect(first).toBe(second);
    expect(first).not.toBe('sk-123456');
    expect(first?.split('').sort().join('')).toBe('sk-123456'.split('').sort().join(''));
  });

  it('paints over the text in place for blur and block', () => {
    for (const style of ['blur', 'block']) {
      const manager = new DecorationManager(setup({ 'appearance.style': style }));
      const { decorations } = render(manager, document);
      expect(decorations).toHaveLength(1);
      expect(decorations[0].renderOptions).toBeUndefined();
    }
  });
});

describe('DecorationManager gating', () => {
  it('hides nothing while the extension is disabled', () => {
    const manager = new DecorationManager(setup({ enabled: false }));
    expect(render(manager, makeDocument('API_KEY=abc', '/app/.env')).decorations).toHaveLength(0);
  });

  it('hides nothing while the secrets feature is off', () => {
    const manager = new DecorationManager(setup({ 'features.secrets': false }));
    expect(render(manager, makeDocument('API_KEY=abc', '/app/.env')).decorations).toHaveLength(0);
  });

  it('only scans files matching the configured file patterns', () => {
    const manager = new DecorationManager(setup({}));
    expect(render(manager, makeDocument('API_KEY=abc', '/app/.env')).decorations).toHaveLength(1);
    expect(render(manager, makeDocument('API_KEY=abc', '/app/notes.txt')).decorations).toHaveLength(
      0
    );
  });

  it('only hides keys matching the key patterns', () => {
    const manager = new DecorationManager(setup({}));
    const document = makeDocument('API_KEY=abc\nPORT=3000', '/app/.env');
    const { decorations } = render(manager, document);
    expect(decorations).toHaveLength(1);
    expect(decorations[0].range.start.line).toBe(0);
  });

  it('skips excluded files', () => {
    const manager = new DecorationManager(setup({ 'files.excluded': ['/app/.env'] }));
    expect(render(manager, makeDocument('API_KEY=abc', '/app/.env')).decorations).toHaveLength(0);
  });

  it('respects the language list for type annotations', () => {
    const manager = new DecorationManager(
      setup({ 'features.types': true, 'types.languages': ['python'] })
    );
    expect(render(manager, makeDocument('const a: number = 1;', 'a.ts')).decorations).toHaveLength(
      0
    );
    expect(render(manager, makeDocument('a: int = 1', 'a.py')).decorations).toHaveLength(1);
  });

  it('honours the two comment settings independently', () => {
    const source = '// line\n/* block */\n';
    const lineOnly = new DecorationManager(
      setup({ 'features.comments': true, 'comments.hideBlockComments': false })
    );
    expect(render(lineOnly, makeDocument(source, 'a.ts')).decorations).toHaveLength(1);

    const blockOnly = new DecorationManager(
      setup({ 'features.comments': true, 'comments.hideLineComments': false })
    );
    expect(render(blockOnly, makeDocument(source, 'a.ts')).decorations).toHaveLength(1);
  });
});

describe('DecorationManager line reveal', () => {
  it('stops hiding a line that was toggled, and hides it again on the second toggle', () => {
    const manager = new DecorationManager(setup({}));
    const document = makeDocument('API_KEY=abc\nDB_PASSWORD=xyz', '/app/.env');
    const editor = { document, setDecorations: jest.fn() } as unknown as vscode.TextEditor;

    manager.updateDecorations(editor);
    expect((editor.setDecorations as unknown as jest.Mock).mock.calls[0][1]).toHaveLength(2);

    manager.toggleLines(editor, [0]);
    const revealed = (editor.setDecorations as unknown as jest.Mock).mock.calls.at(-1)![1];
    expect(revealed).toHaveLength(1);
    expect(revealed[0].range.start.line).toBe(1);

    manager.toggleLines(editor, [0]);
    expect((editor.setDecorations as unknown as jest.Mock).mock.calls.at(-1)![1]).toHaveLength(2);
  });

  it('finds the key on a line for the exclude command', () => {
    const manager = new DecorationManager(setup({}));
    const document = makeDocument('API_KEY=abc', '/app/.env');
    expect(manager.secretKeyAt(document, new vscode.Position(0, 2))).toBe('API_KEY');
  });
});
