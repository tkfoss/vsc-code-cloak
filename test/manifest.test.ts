import * as vscode from 'vscode';
import { CommandManager } from '../src/commands/CommandManager';
import { CLOAK_STYLES, ConfigManager } from '../src/config/ConfigManager';
import { DecorationManager } from '../src/decorations/DecorationManager';
import { StatusBarManager } from '../src/ui/StatusBarManager';
import { FoldingManager } from '../src/folding/FoldingManager';
import { CloakFoldingRangeProvider } from '../src/folding/FoldingProvider';
import { registeredCommands } from './vscode';
import manifest from '../package.json';

/**
 * Guards the two halves of a command staying in step. A command registered in
 * code but missing from the manifest is invisible in the palette; a command in
 * the manifest with no handler throws when invoked.
 */
describe('command manifest', () => {
  const registered = (() => {
    registeredCommands.length = 0;
    const configManager = new ConfigManager();
    const decorationManager = new DecorationManager(configManager);
    const foldingProvider = new CloakFoldingRangeProvider(configManager);
    const commandManager = new CommandManager(
      configManager,
      decorationManager,
      new StatusBarManager(configManager),
      new FoldingManager(configManager, foldingProvider)
    );
    commandManager.registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
    return [...registeredCommands];
  })();

  const contributed = manifest.contributes.commands.map((command) => command.command);

  it('registers a handler for every contributed command', () => {
    expect(contributed.filter((id) => !registered.includes(id))).toEqual([]);
  });

  it('contributes every registered command', () => {
    expect(registered.filter((id) => !contributed.includes(id))).toEqual([]);
  });

  it('binds keys only to commands that exist', () => {
    const bound = manifest.contributes.keybindings.map((binding) => binding.command);
    expect(bound.filter((id) => !contributed.includes(id))).toEqual([]);
  });

  it('lists menu entries only for commands that exist', () => {
    const menu = manifest.contributes.menus['codeCloak.mainMenu'].map((item) => item.command);
    expect(menu.filter((id) => !contributed.includes(id))).toEqual([]);
  });

  describe('appearance styles', () => {
    const setting = manifest.contributes.configuration.properties['codeCloak.appearance.style'];

    it('declares exactly the styles the code implements', () => {
      expect(setting.enum).toEqual([...CLOAK_STYLES]);
    });

    it('describes every style it declares', () => {
      expect(setting.enumDescriptions).toHaveLength(setting.enum.length);
    });

    it('defaults to a style that exists', () => {
      expect(setting.enum).toContain(setting.default);
    });
  });

  /**
   * The config layer passes its own fallback to every `get`, so a setting that
   * is read but never declared does not fail loudly -- it quietly serves that
   * fallback, and an array one falls back to empty, disabling the feature.
   */
  describe('settings', () => {
    const declared = Object.keys(manifest.contributes.configuration.properties);
    const read = (() => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'src', 'config', 'ConfigManager.ts'),
        'utf8'
      );
      const matches = source.matchAll(/config\.get(?:<[^>]+>)?\('([^']+)'/g);
      return [...new Set([...matches].map((match: RegExpMatchArray) => `codeCloak.${match[1]}`))];
    })();

    it('declares every setting the config layer reads', () => {
      expect(read.filter((key) => !declared.includes(key))).toEqual([]);
    });

    it('reads every setting it declares', () => {
      expect(declared.filter((key) => !read.includes(key))).toEqual([]);
    });
  });

  it('ships the icon the manifest points at', () => {
    expect(require('fs').existsSync(require('path').join(__dirname, '..', manifest.icon))).toBe(
      true
    );
  });
});
