import * as vscode from 'vscode';

/**
 * Every hiding style, in the order the picker offers them. The type is derived
 * from this list, and `manifest.test.ts` checks the settings enum against it,
 * so a style cannot exist in one place and not the others.
 */
export const CLOAK_STYLES = [
  'text',
  'compact',
  'dots',
  'stars',
  'scramble',
  'blur',
  'block',
] as const;

export type CloakStyle = (typeof CLOAK_STYLES)[number];
export type CloakFeature = 'secrets' | 'types' | 'comments' | 'docstrings';

export interface CloakConfig {
  enabled: boolean;
  autoHide: boolean;
  features: Record<CloakFeature, boolean>;
  secrets: {
    filePatterns: string[];
    keyPatterns: string[];
    excludeKeys: string[];
  };
  appearance: {
    style: CloakStyle;
    hiddenText: string;
    compactText: string;
    textColor: string;
    backgroundColor: string;
    opacity: number;
  };
  types: {
    languages: string[];
  };
  comments: {
    hideLineComments: boolean;
    hideBlockComments: boolean;
  };
  docstrings: {
    languages: string[];
  };
  folding: {
    enabled: boolean;
    inline: boolean;
    minimumLines: number;
    trimBlankLines: boolean;
  };
  files: {
    excluded: string[];
  };
  hover: {
    showPreview: boolean;
    message: string;
  };
}

const SECTION = 'codeCloak';

/**
 * Owns the extension's settings plus the per-session visibility state.
 *
 * Settings are persisted; the per-feature hidden flags are not. They start from
 * `autoHide` and are flipped by the hide/show commands, so revealing a secret
 * for a demo never leaves a permanent change behind in the user's settings.
 */
export class ConfigManager {
  private config: CloakConfig;
  private hidden: Record<CloakFeature, boolean>;
  private revision = 0;
  private readonly globCache = new Map<string, RegExp>();

  constructor() {
    this.config = this.loadConfig();
    this.hidden = this.initialHiddenState();
  }

  private loadConfig(): CloakConfig {
    const config = vscode.workspace.getConfiguration(SECTION);

    return {
      enabled: config.get('enabled', true),
      autoHide: config.get('autoHide', true),
      features: {
        secrets: config.get('features.secrets', true),
        types: config.get('features.types', false),
        comments: config.get('features.comments', false),
        docstrings: config.get('features.docstrings', false),
      },
      secrets: {
        filePatterns: config.get('secrets.filePatterns', []),
        keyPatterns: config.get('secrets.keyPatterns', []),
        excludeKeys: config.get('secrets.excludeKeys', []),
      },
      appearance: {
        style: config.get<CloakStyle>('appearance.style', 'compact'),
        hiddenText: config.get('appearance.hiddenText', '***HIDDEN***'),
        compactText: config.get('appearance.compactText', '•'),
        textColor: config.get('appearance.textColor', 'auto'),
        backgroundColor: config.get('appearance.backgroundColor', 'auto'),
        opacity: config.get('appearance.opacity', 0.3),
      },
      types: {
        languages: config.get('types.languages', ['typescript', 'typescriptreact', 'python']),
      },
      comments: {
        hideLineComments: config.get('comments.hideLineComments', true),
        hideBlockComments: config.get('comments.hideBlockComments', true),
      },
      docstrings: {
        languages: config.get('docstrings.languages', ['python', 'jupyter']),
      },
      folding: {
        enabled: config.get('folding.enabled', true),
        inline: config.get('folding.inline', true),
        minimumLines: Math.max(2, config.get('folding.minimumLines', 2)),
        trimBlankLines: config.get('folding.trimBlankLines', true),
      },
      files: {
        excluded: config.get('files.excluded', []),
      },
      hover: {
        showPreview: config.get('hover.showPreview', false),
        message: config.get('hover.message', 'Content hidden by Code Cloak'),
      },
    };
  }

  private initialHiddenState(): Record<CloakFeature, boolean> {
    const hidden = this.config.autoHide;
    return { secrets: hidden, types: hidden, comments: hidden, docstrings: hidden };
  }

  public reloadConfig(): void {
    const previousAutoHide = this.config.autoHide;
    this.config = this.loadConfig();
    this.globCache.clear();
    this.bump();

    // Only resynchronise session state when the user changed what autoHide means;
    // otherwise an unrelated settings edit would undo a manual reveal.
    if (previousAutoHide !== this.config.autoHide) {
      this.hidden = this.initialHiddenState();
    }
  }

  public getConfig(): CloakConfig {
    return this.config;
  }

  /**
   * Changes whenever anything affecting decoration output changes. Stored
   * alongside a cached render to decide whether it is still valid.
   *
   * A counter rather than a serialisation of the settings: this is read on
   * every redraw of every visible editor, so hashing the whole config here
   * would put avoidable work on the keystroke path.
   */
  public getRevision(): number {
    return this.revision;
  }

  private bump(): void {
    this.revision++;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    await this.updateSetting('enabled', enabled);
    this.config.enabled = enabled;
    this.bump();
  }

  public isFeatureEnabled(feature: CloakFeature): boolean {
    return this.config.features[feature];
  }

  public isHidden(feature: CloakFeature): boolean {
    return this.hidden[feature] && this.isFeatureEnabled(feature);
  }

  public setHidden(feature: CloakFeature, hidden: boolean): void {
    this.hidden[feature] = hidden;
    this.bump();
  }

  public isFoldingEnabled(): boolean {
    return this.config.folding.enabled;
  }

  public async setFoldingEnabled(enabled: boolean): Promise<void> {
    await this.updateSetting('folding.enabled', enabled);
    this.config.folding.enabled = enabled;
    this.bump();
  }

  public isLanguageEnabled(feature: 'types' | 'docstrings', languageId: string): boolean {
    return this.config[feature].languages.includes(languageId);
  }

  /** True when the file is one of the configured secret-bearing file types. */
  public matchesSecretFilePattern(filePath: string): boolean {
    return this.matchesPattern(this.baseName(filePath), this.config.secrets.filePatterns);
  }

  public isFileExcluded(filePath: string): boolean {
    const normalized = this.normalize(filePath);
    const baseName = this.baseName(filePath);

    return this.config.files.excluded.some((entry) => {
      const excluded = this.normalize(entry);
      if (!excluded) {
        return false;
      }
      if (excluded === normalized) {
        return true;
      }
      if (excluded.includes('*') || excluded.includes('?')) {
        return (
          this.matchesPattern(normalized, [excluded]) || this.matchesPattern(baseName, [excluded])
        );
      }
      // Workspace-relative entries match any file whose path ends with them, so
      // an entry written on one machine still resolves on another.
      if (!this.isAbsolute(excluded) && normalized.endsWith(`/${excluded}`)) {
        return true;
      }
      // Bare directory entries exclude everything beneath them.
      const directory = excluded.endsWith('/') ? excluded : `${excluded}/`;
      return normalized.startsWith(directory) || normalized.includes(`/${directory}`);
    });
  }

  public async excludeFile(filePath: string): Promise<void> {
    const entry = this.toWorkspaceRelative(filePath);
    if (this.isFileExcluded(filePath)) {
      return;
    }
    const excluded = [...this.config.files.excluded, entry];
    await this.updateSetting('files.excluded', excluded, this.pathScope());
    this.config.files.excluded = excluded;
    this.bump();
  }

  public async includeFile(filePath: string): Promise<void> {
    const normalized = this.normalize(filePath);
    const relative = this.normalize(this.toWorkspaceRelative(filePath));

    // Drop both spellings: an entry added before a workspace was open is stored
    // absolute, one added afterwards is stored relative.
    const excluded = this.config.files.excluded.filter((entry) => {
      const candidate = this.normalize(entry);
      return candidate !== normalized && candidate !== relative;
    });

    await this.updateSetting('files.excluded', excluded, this.pathScope());
    this.config.files.excluded = excluded;
    this.bump();
  }

  /**
   * A path relative to its workspace folder where possible. Absolute paths in
   * the exclude list are meaningless on any other machine, and global settings
   * are routinely synced between machines.
   */
  private toWorkspaceRelative(filePath: string): string {
    const normalized = this.normalize(filePath);

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const root = this.normalize(folder.uri.fsPath).replace(/\/$/, '');
      if (normalized === root) {
        return normalized;
      }
      if (normalized.startsWith(`${root}/`)) {
        return normalized.slice(root.length + 1);
      }
    }
    return normalized;
  }

  /** Path settings belong to the workspace that gives them meaning. */
  private pathScope(): vscode.ConfigurationTarget {
    return vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  }

  private isAbsolute(normalizedPath: string): boolean {
    return normalizedPath.startsWith('/') || /^[A-Za-z]:\//.test(normalizedPath);
  }

  public async addExcludedKey(key: string): Promise<void> {
    if (this.config.secrets.excludeKeys.includes(key)) {
      return;
    }
    const excludeKeys = [...this.config.secrets.excludeKeys, key];
    await this.updateSetting('secrets.excludeKeys', excludeKeys);
    this.config.secrets.excludeKeys = excludeKeys;
    this.bump();
  }

  public async setStyle(style: CloakStyle): Promise<void> {
    await this.updateSetting('appearance.style', style);
    this.config.appearance.style = style;
    this.bump();
  }

  /** Case-insensitive glob match against any of `patterns` (`*` and `?` only). */
  public matchesPattern(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => this.toRegExp(pattern).test(text));
  }

  public shouldHideKey(key: string): boolean {
    if (this.matchesPattern(key, this.config.secrets.excludeKeys)) {
      return false;
    }
    return this.matchesPattern(key, this.config.secrets.keyPatterns);
  }

  /**
   * Every regex metacharacter is escaped first and the wildcards are re-expanded
   * afterwards. Expanding first and escaping afterwards would escape the dots
   * the expansion just produced.
   */
  private toRegExp(pattern: string): RegExp {
    const cached = this.globCache.get(pattern);
    if (cached) {
      return cached;
    }

    const body = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*')
      .replace(/\\\?/g, '.');
    const regex = new RegExp(`^${body}$`, 'i');

    this.globCache.set(pattern, regex);
    return regex;
  }

  /**
   * Writes to the scope the setting is already defined in, so a workspace value
   * is not silently shadowed by a global write that never takes effect.
   *
   * `fallback` chooses the scope for a setting not yet defined anywhere.
   */
  private async updateSetting(
    key: string,
    value: unknown,
    fallback: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(SECTION);
    const inspected = config.inspect(key);

    let target = fallback;
    if (inspected?.workspaceFolderValue !== undefined) {
      target = vscode.ConfigurationTarget.WorkspaceFolder;
    } else if (inspected?.workspaceValue !== undefined) {
      target = vscode.ConfigurationTarget.Workspace;
    }

    await config.update(key, value, target);
  }

  private normalize(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }

  private baseName(filePath: string): string {
    return this.normalize(filePath).split('/').pop() ?? '';
  }
}
