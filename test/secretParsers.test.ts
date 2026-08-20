import { EnvParser } from '../src/parsers/EnvParser';
import { JsonParser } from '../src/parsers/JsonParser';
import { YamlParser } from '../src/parsers/YamlParser';
import { PropertiesParser } from '../src/parsers/PropertiesParser';
import { makeDocument, textOf } from './helpers';

describe('EnvParser', () => {
  const parser = new EnvParser();

  const parse = (text: string, fileName = '.env') => {
    const document = makeDocument(text, fileName);
    return parser.parse(document).map((r) => ({ ...r, covered: textOf(document, r.range) }));
  };

  it('recognises dotenv, envrc and shell files', () => {
    expect(parser.canParse(makeDocument('', '/app/.env'))).toBe(true);
    expect(parser.canParse(makeDocument('', '/app/.env.production'))).toBe(true);
    expect(parser.canParse(makeDocument('', '/app/.envrc'))).toBe(true);
    expect(parser.canParse(makeDocument('', '/app/deploy.sh'))).toBe(true);
    expect(parser.canParse(makeDocument('', '/app/config.json'))).toBe(false);
  });

  it('extracts the value, not the first place the text happens to appear', () => {
    const [result] = parse('TOKEN=TOKEN');
    expect(result.key).toBe('TOKEN');
    expect(result.covered).toBe('TOKEN');
    expect(result.range.start.character).toBe(6);
  });

  it('handles export prefixes and surrounding whitespace', () => {
    const [result] = parse('export API_KEY = sk-123');
    expect(result.key).toBe('API_KEY');
    expect(result.covered).toBe('sk-123');
  });

  it('reports the inside of a quoted value so the quotes stay visible', () => {
    const [result] = parse('PASSWORD="p@ss word"');
    expect(result.covered).toBe('p@ss word');
  });

  it('stops before a trailing comment', () => {
    const [result] = parse('API_KEY=abc123 # production key');
    expect(result.covered).toBe('abc123');
  });

  it('keeps a hash that is part of the value', () => {
    const [result] = parse('COLOR=#ff0000');
    expect(result.covered).toBe('#ff0000');
  });

  it('skips comments, blank lines and empty values', () => {
    expect(parse('# comment\n\nEMPTY=\nKEY=value')).toHaveLength(1);
  });
});

describe('JsonParser', () => {
  const parser = new JsonParser();

  const parse = (text: string, fileName = 'config.json') => {
    const document = makeDocument(text, fileName);
    return parser.parse(document).map((r) => ({ ...r, covered: textOf(document, r.range) }));
  };

  it('extracts string, numeric and literal values', () => {
    const results = parse('{"apiKey": "secret", "port": 8080, "debug": true}');
    expect(results.map((r) => [r.key, r.covered])).toEqual([
      ['apiKey', 'secret'],
      ['port', '8080'],
      ['debug', 'true'],
    ]);
  });

  it('descends into nested objects and arrays', () => {
    const results = parse('{"db": {"password": "hunter2"}, "hosts": ["a"]}');
    expect(results.map((r) => r.key)).toEqual(['password']);
  });

  it('parses a file that is not yet valid JSON', () => {
    const results = parse('{\n  "apiKey": "secret",\n  "half": \n');
    expect(results.map((r) => r.key)).toContain('apiKey');
  });

  it('parses JSONC, including values that follow a comment', () => {
    const results = parse('{\n  // the key\n  "apiKey": "secret" /* inline */\n}', 'config.jsonc');
    expect(results.map((r) => [r.key, r.covered])).toEqual([['apiKey', 'secret']]);
  });

  it('does not treat a string value as a key', () => {
    const results = parse('{"a": "b", "c": "d"}');
    expect(results.map((r) => r.key)).toEqual(['a', 'c']);
  });

  it('handles escaped quotes inside values', () => {
    const [result] = parse('{"note": "say \\"hi\\""}');
    expect(result.covered).toBe('say \\"hi\\"');
  });
});

describe('YamlParser', () => {
  const parser = new YamlParser();

  const parse = (text: string) => {
    const document = makeDocument(text, 'config.yaml');
    return parser.parse(document).map((r) => ({ ...r, covered: textOf(document, r.range) }));
  };

  it('extracts nested and list-item mappings', () => {
    const results = parse('db:\n  password: hunter2\nservers:\n  - name: web\n');
    expect(results.map((r) => [r.key, r.covered])).toEqual([
      ['password', 'hunter2'],
      ['name', 'web'],
    ]);
  });

  it('strips quotes and trailing comments', () => {
    expect(parse('token: "abc"')[0].covered).toBe('abc');
    expect(parse('token: abc # note')[0].covered).toBe('abc');
  });

  it('emits one range per line of a block scalar', () => {
    const results = parse('key: |\n  line one\n  line two\nnext: value\n');
    expect(results.map((r) => [r.key, r.covered])).toEqual([
      ['key', 'line one'],
      ['key', 'line two'],
      ['next', 'value'],
    ]);
  });

  it('ignores comments, blank lines and document markers', () => {
    expect(parse('---\n# comment\n\nkey: value\n')).toHaveLength(1);
  });

  it('ignores keys with no value', () => {
    expect(parse('parent:\n  child: value\n').map((r) => r.key)).toEqual(['child']);
  });
});

describe('PropertiesParser', () => {
  const parser = new PropertiesParser();

  const parse = (text: string, fileName = 'app.properties') => {
    const document = makeDocument(text, fileName);
    return parser.parse(document).map((r) => ({ ...r, covered: textOf(document, r.range) }));
  };

  it('claims properties, ini, conf, cfg and toml files', () => {
    for (const name of ['a.properties', 'a.ini', 'a.conf', 'a.cfg', 'a.toml']) {
      expect(parser.canParse(makeDocument('', name))).toBe(true);
    }
    expect(parser.canParse(makeDocument('', 'a.yaml'))).toBe(false);
  });

  it('reads both = and : assignments', () => {
    const results = parse('db.password=hunter2\ndb.user: admin');
    expect(results.map((r) => [r.key, r.covered])).toEqual([
      ['db.password', 'hunter2'],
      ['db.user', 'admin'],
    ]);
  });

  it('skips section headers and both comment styles', () => {
    expect(parse('[section]\n; a\n# b\nkey=value')).toHaveLength(1);
  });

  it('unwraps quoted TOML values', () => {
    expect(parse('token = "abc"', 'app.toml')[0].covered).toBe('abc');
  });
});
