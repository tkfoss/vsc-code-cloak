import { ConfigManager } from '../src/config/ConfigManager';
import { settings } from './vscode';

function configure(values: Record<string, unknown>): ConfigManager {
  settings.clear();
  for (const [key, value] of Object.entries(values)) {
    settings.set(`codeCloak.${key}`, value);
  }
  return new ConfigManager();
}

describe('ConfigManager.matchesPattern', () => {
  const config = configure({});

  it.each([
    ['*KEY*', 'API_KEY'],
    ['*KEY*', 'KEY'],
    ['*KEY*', 'MY_KEY_NAME'],
    ['*TOKEN*', 'github_token'],
    ['PUBLIC*', 'PUBLIC_URL'],
    ['*_TEST', 'DB_TEST'],
    ['*.json', 'package.json'],
    ['.env*', '.env.local'],
    ['?ID', 'XID'],
  ])('pattern %s matches %s', (pattern, text) => {
    expect(config.matchesPattern(text, [pattern])).toBe(true);
  });

  it.each([
    ['*KEY*', 'PASSWORD'],
    ['PUBLIC*', 'NOT_PUBLIC'],
    ['*.json', 'package.jsonc'],
    ['?ID', 'LONGID'],
  ])('pattern %s does not match %s', (pattern, text) => {
    expect(config.matchesPattern(text, [pattern])).toBe(false);
  });

  it('treats dots as literal, not as a wildcard', () => {
    expect(config.matchesPattern('axbxc', ['a.b.c'])).toBe(false);
    expect(config.matchesPattern('a.b.c', ['a.b.c'])).toBe(true);
  });

  it('does not let pattern metacharacters build a different regex', () => {
    expect(config.matchesPattern('anything', ['(a|b)+'])).toBe(false);
    expect(config.matchesPattern('(a|b)+', ['(a|b)+'])).toBe(true);
  });
});

describe('ConfigManager.shouldHideKey', () => {
  const config = configure({
    'secrets.keyPatterns': ['*KEY*', '*SECRET*'],
    'secrets.excludeKeys': ['PUBLIC*', '*_TEST'],
  });

  it('hides keys matching a key pattern', () => {
    expect(config.shouldHideKey('API_KEY')).toBe(true);
    expect(config.shouldHideKey('client_secret')).toBe(true);
  });

  it('never hides excluded keys, even when they match a key pattern', () => {
    expect(config.shouldHideKey('PUBLIC_KEY')).toBe(false);
    expect(config.shouldHideKey('SECRET_TEST')).toBe(false);
  });

  it('leaves unrelated keys alone', () => {
    expect(config.shouldHideKey('PORT')).toBe(false);
  });
});

describe('ConfigManager.isFileExcluded', () => {
  it('matches exact paths and normalises separators', () => {
    const config = configure({ 'files.excluded': ['/home/dev/app/.env'] });
    expect(config.isFileExcluded('/home/dev/app/.env')).toBe(true);
    expect(config.isFileExcluded('\\home\\dev\\app\\.env')).toBe(true);
  });

  it('does not exclude a file merely containing an entry as a substring', () => {
    const config = configure({ 'files.excluded': ['/app/.env'] });
    expect(config.isFileExcluded('/app/.env.production')).toBe(false);
  });

  it('excludes everything under a directory entry', () => {
    const config = configure({ 'files.excluded': ['/app/fixtures'] });
    expect(config.isFileExcluded('/app/fixtures/secrets.env')).toBe(true);
    expect(config.isFileExcluded('/app/fixtures-2/secrets.env')).toBe(false);
  });

  it('supports glob entries against the full path and the file name', () => {
    const config = configure({ 'files.excluded': ['*.example.env'] });
    expect(config.isFileExcluded('/app/config/db.example.env')).toBe(true);
    expect(config.isFileExcluded('/app/config/db.env')).toBe(false);
  });
});

describe('ConfigManager session state', () => {
  it('starts hidden when autoHide is on', () => {
    const config = configure({ autoHide: true, 'features.types': true });
    expect(config.isHidden('secrets')).toBe(true);
    expect(config.isHidden('types')).toBe(true);
  });

  it('starts revealed when autoHide is off', () => {
    const config = configure({ autoHide: false });
    expect(config.isHidden('secrets')).toBe(false);
  });

  it('reports a feature as not hidden while the feature itself is disabled', () => {
    const config = configure({ autoHide: true, 'features.comments': false });
    config.setHidden('comments', true);
    expect(config.isHidden('comments')).toBe(false);
  });

  it('keeps a manual reveal across unrelated settings changes', () => {
    const config = configure({ autoHide: true });
    config.setHidden('secrets', false);

    settings.set('codeCloak.appearance.style', 'dots');
    config.reloadConfig();

    expect(config.isHidden('secrets')).toBe(false);
  });

  it('resynchronises when autoHide itself changes', () => {
    const config = configure({ autoHide: true });
    config.setHidden('secrets', false);

    settings.set('codeCloak.autoHide', false);
    config.reloadConfig();
    settings.set('codeCloak.autoHide', true);
    config.reloadConfig();

    expect(config.isHidden('secrets')).toBe(true);
  });
});
