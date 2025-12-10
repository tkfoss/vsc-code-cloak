import * as vscode from 'vscode';

export interface CloakConfig {
  enabled: boolean;
  autoHide: boolean;
  features: {
    secrets: boolean;
    types: boolean;
    comments: boolean;
    docstrings: boolean;
  };
  secrets: {
    filePatterns: string[];
    keyPatterns: string[];
    excludeKeys: string[];
  };
  appearance: {
    style: 'text' | 'dots' | 'stars' | 'scramble' | 'blur' | 'block';
    hiddenText: string;
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
  files: {
    excluded: string[];
  };
  hover: {
    showPreview: boolean;
    message: string;
  };
}

export class ConfigManager {
  private config: CloakConfig;
  private secretsHidden: boolean = true;
  private typesHidden: boolean = true;
  private commentsHidden: boolean = true;
  private docstringsHidden: boolean = true;

  constructor() {
    this.config = this.loadConfig();
    // Initialize hidden states based on autoHide config
    if (!this.config.autoHide) {
      this.secretsHidden = false;
      this.typesHidden = false;
      this.commentsHidden = false;
      this.docstringsHidden = false;
    }
  }

  private loadConfig(): CloakConfig {
    const config = vscode.workspace.getConfiguration('codeCloak');

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
        style: config.get('appearance.style', 'text'),
        hiddenText: config.get('appearance.hiddenText', '***HIDDEN***'),
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
      files: {
        excluded: config.get('files.excluded', []),
      },
      hover: {
        showPreview: config.get('hover.showPreview', false),
        message: config.get('hover.message', 'Content hidden by Code Cloak'),
      },
    };
  }

  public reloadConfig(): void {
    this.config = this.loadConfig();
  }

  public getConfig(): CloakConfig {
    return this.config;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration('codeCloak')
      .update('enabled', enabled, vscode.ConfigurationTarget.Global);
    this.config.enabled = enabled;
  }

  public isFeatureEnabled(feature: 'secrets' | 'types' | 'comments' | 'docstrings'): boolean {
    return this.config.features[feature];
  }

  public isSecretsHidden(): boolean {
    return this.secretsHidden && this.isFeatureEnabled('secrets');
  }

  public isTypesHidden(): boolean {
    return this.typesHidden && this.isFeatureEnabled('types');
  }

  public isCommentsHidden(): boolean {
    return this.commentsHidden && this.isFeatureEnabled('comments');
  }

  public isDocstringsHidden(): boolean {
    return this.docstringsHidden && this.isFeatureEnabled('docstrings');
  }

  public setSecretsHidden(hidden: boolean): void {
    this.secretsHidden = hidden;
  }

  public setTypesHidden(hidden: boolean): void {
    this.typesHidden = hidden;
  }

  public setCommentsHidden(hidden: boolean): void {
    this.commentsHidden = hidden;
  }

  public setDocstringsHidden(hidden: boolean): void {
    this.docstringsHidden = hidden;
  }

  public isFileExcluded(filePath: string): boolean {
    return this.config.files.excluded.some((excluded) => filePath.includes(excluded));
  }

  public async excludeFile(filePath: string): Promise<void> {
    const excluded = [...this.config.files.excluded, filePath];
    await vscode.workspace
      .getConfiguration('codeCloak')
      .update('files.excluded', excluded, vscode.ConfigurationTarget.Global);
    this.config.files.excluded = excluded;
  }

  public async includeFile(filePath: string): Promise<void> {
    const excluded = this.config.files.excluded.filter((path) => path !== filePath);
    await vscode.workspace
      .getConfiguration('codeCloak')
      .update('files.excluded', excluded, vscode.ConfigurationTarget.Global);
    this.config.files.excluded = excluded;
  }

  public matchesPattern(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\./g, '\\.');
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(text);
    });
  }

  public shouldHideKey(key: string): boolean {
    // Check exclude list first
    if (this.matchesPattern(key, this.config.secrets.excludeKeys)) {
      return false;
    }
    // Check key patterns
    return this.matchesPattern(key, this.config.secrets.keyPatterns);
  }
}
