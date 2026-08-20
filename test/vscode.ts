/**
 * Minimal stand-in for the `vscode` module.
 *
 * The real module only exists inside the extension host, so unit tests map
 * `vscode` here. Only the surface the extension actually touches is modelled.
 */

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}

  isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }

  isBeforeOrEqual(other: Position): boolean {
    return this.isBefore(other) || this.isEqual(other);
  }

  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }

  compareTo(other: Position): number {
    return this.line - other.line || this.character - other.character;
  }
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position
  ) {}

  get isSingleLine(): boolean {
    return this.start.line === this.end.line;
  }

  contains(position: Position): boolean {
    return this.start.isBeforeOrEqual(position) && position.isBeforeOrEqual(this.end);
  }
}

export class MarkdownString {
  constructor(public value = '') {}

  appendMarkdown(text: string): this {
    this.value += text;
    return this;
  }

  appendCodeblock(text: string): this {
    this.value += `\n\`\`\`\n${text}\n\`\`\`\n`;
    return this;
  }
}

export class FoldingRange {
  constructor(
    public readonly start: number,
    public readonly end: number,
    public readonly kind?: number
  ) {}
}

export const FoldingRangeKind = { Comment: 1, Imports: 2, Region: 3 };
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const QuickPickItemKind = { Separator: -1, Default: 0 };

export class ThemeColor {
  constructor(public readonly id: string) {}
}

/** Settings the fake `workspace.getConfiguration` serves, keyed by dotted path. */
export const settings = new Map<string, unknown>();

export const workspace = {
  workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,

  getConfiguration(section: string) {
    return {
      get<T>(key: string, fallback: T): T {
        const value = settings.get(`${section}.${key}`);
        return value === undefined ? fallback : (value as T);
      },
      inspect(key: string) {
        return { key, globalValue: settings.get(`${section}.${key}`) };
      },
      async update(key: string, value: unknown): Promise<void> {
        settings.set(`${section}.${key}`, value);
      },
    };
  },
};

export const window = {
  visibleTextEditors: [] as unknown[],
  activeTextEditor: undefined as unknown,
  createTextEditorDecorationType: (options: unknown) => ({ options, dispose: () => undefined }),
  createStatusBarItem: () => ({ show: () => undefined, dispose: () => undefined }),
  setStatusBarMessage: () => ({ dispose: () => undefined }),
  showQuickPick: async () => undefined,
  showWarningMessage: async () => undefined,
  showInformationMessage: async () => undefined,
};

/** Command ids passed to `registerCommand`, for manifest consistency checks. */
export const registeredCommands: string[] = [];

export const commands = {
  registerCommand(id: string) {
    registeredCommands.push(id);
    return { dispose: () => undefined };
  },
  executeCommand: async () => undefined,
};

export const languages = {
  registerFoldingRangeProvider: () => ({ dispose: () => undefined }),
};
