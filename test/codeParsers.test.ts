import { TypeScriptASTParser } from '../src/parsers/TypeScriptASTParser';
import { PythonASTParser } from '../src/parsers/PythonASTParser';
import { CommentParser } from '../src/parsers/CommentParser';
import { DocstringParser } from '../src/parsers/DocstringParser';
import { makeDocument, textOf } from './helpers';

describe('TypeScriptASTParser', () => {
  const parser = new TypeScriptASTParser();

  const parse = (text: string, fileName = 'file.ts') => {
    const document = makeDocument(text, fileName);
    return parser.parse(document).map((r) => textOf(document, r.range));
  };

  it('covers the annotation together with its colon', () => {
    expect(parse('function greet(name: string): string { return name; }')).toEqual([
      ': string',
      ': string',
    ]);
  });

  it('handles variables, properties and arrow functions', () => {
    expect(parse('const n: number = 1;')).toEqual([': number']);
    expect(parse('class A { private x: string = ""; }')).toEqual([': string']);
    expect(parse('const f = (a: number): void => {};')).toEqual([': number', ': void']);
  });

  it('keeps an optional marker visible', () => {
    expect(parse('function f(a?: string) {}')).toEqual([': string']);
  });

  it('reports a generic annotation once rather than once per type argument', () => {
    expect(parse('const m: Map<string, number> = new Map();')).toEqual([': Map<string, number>']);
  });

  it('does not emit overlapping ranges for nested type literals', () => {
    expect(parse('const o: { a: string } = { a: "" };')).toEqual([': { a: string }']);
  });

  it('covers interface members', () => {
    expect(parse('interface A { name: string; }')).toEqual([': string']);
  });

  it('skips annotations that span lines, which cannot be masked', () => {
    expect(parse('const o: {\n  a: string;\n} = { a: "" };')).toEqual([': string']);
  });

  it('parses TSX without treating the tags as comparisons', () => {
    expect(parse('const C = (p: Props) => <div a={1} />;', 'file.tsx')).toEqual([': Props']);
  });

  it('finds nothing to hide in plain JavaScript', () => {
    expect(parse('const a = 1;', 'file.js')).toEqual([]);
  });
});

describe('PythonASTParser', () => {
  const parser = new PythonASTParser();

  const parse = (text: string) => {
    const document = makeDocument(text, 'file.py');
    return parser.parse(document).map((r) => textOf(document, r.range));
  };

  it('extracts parameter annotations inside the signature', () => {
    expect(parse('def foo(x: int, y: str) -> bool:\n    pass')).toEqual([
      ': int',
      ': str',
      '-> bool',
    ]);
  });

  it('keeps a default value visible', () => {
    expect(parse('def foo(x: int = 3):\n    pass')).toEqual([': int']);
  });

  it('handles subscripted and nested generics', () => {
    expect(parse('def foo(x: Dict[str, List[int]]) -> Optional[str]:\n    pass')).toEqual([
      ': Dict[str, List[int]]',
      '-> Optional[str]',
    ]);
  });

  it('handles signatures wrapped over several lines', () => {
    expect(parse('def foo(\n    x: int,\n    y: str,\n) -> bool:\n    pass')).toEqual([
      ': int',
      ': str',
      '-> bool',
    ]);
  });

  it('extracts variable and attribute annotations', () => {
    expect(parse('count: int = 0')).toEqual([': int']);
    expect(parse('    self.name: str = ""')).toEqual([': str']);
  });

  it('leaves dictionary literals and slices alone', () => {
    expect(parse('d = {"a": 1}')).toEqual([]);
    expect(parse('x = items[1:2]')).toEqual([]);
  });

  it('ignores colons and arrows inside strings', () => {
    expect(parse('s = "a: int"')).toEqual([]);
    expect(parse('s = "-> int"')).toEqual([]);
  });

  it('handles async definitions', () => {
    expect(parse('async def foo(x: int) -> None:\n    pass')).toEqual([': int', '-> None']);
  });
});

describe('CommentParser', () => {
  const parser = new CommentParser();

  const parse = (text: string, languageId = 'typescript') => {
    const document = makeDocument(text, `file.${languageId}`, languageId);
    return parser.parse(document).map((r) => ({ kind: r.key, covered: textOf(document, r.range) }));
  };

  it('finds line and block comments', () => {
    expect(parse('const a = 1; // note')).toEqual([{ kind: 'line', covered: '// note' }]);
    expect(parse('/* note */ const a = 1;')).toEqual([{ kind: 'block', covered: '/* note */' }]);
  });

  it('spans a multi-line block comment', () => {
    expect(parse('/*\n note\n*/')).toEqual([{ kind: 'block', covered: '/*\n note\n*/' }]);
  });

  it('does not mistake a URL inside a string for a comment', () => {
    expect(parse('const u = "https://example.com";')).toEqual([]);
  });

  it('does not mistake a delimiter inside a string for a comment', () => {
    expect(parse('const a = "/* not a comment */";')).toEqual([]);
    expect(parse('s = "# not a comment"', 'python')).toEqual([]);
  });

  it('uses the language comment syntax', () => {
    expect(parse('# note', 'python')).toEqual([{ kind: 'line', covered: '# note' }]);
    expect(parse('-- note', 'sql')).toEqual([{ kind: 'line', covered: '-- note' }]);
    expect(parse('<!-- note -->', 'html')).toEqual([{ kind: 'block', covered: '<!-- note -->' }]);
    expect(parse('// not a comment in python', 'python')).toEqual([]);
  });

  it('ignores a hash inside a Python docstring', () => {
    expect(parse('"""\n# not a comment\n"""', 'python')).toEqual([]);
  });

  it('reads a comment that follows code on the same line as a block comment ends', () => {
    expect(parse('/* a */ x(); // b')).toEqual([
      { kind: 'block', covered: '/* a */' },
      { kind: 'line', covered: '// b' },
    ]);
  });
});

describe('DocstringParser', () => {
  const parser = new DocstringParser();

  const parse = (text: string) => {
    const document = makeDocument(text, 'file.py');
    return parser.parse(document).map((r) => textOf(document, r.range));
  };

  it('finds single-line and multi-line docstrings', () => {
    expect(parse('def f():\n    """One line."""\n')).toEqual(['"""One line."""']);
    expect(parse('def f():\n    """\n    Body.\n    """\n')).toEqual(['"""\n    Body.\n    """']);
  });

  it('supports both delimiters and string prefixes', () => {
    expect(parse("    '''Single.'''")).toEqual(["'''Single.'''"]);
    expect(parse('    r"""Raw."""')).toEqual(['"""Raw."""']);
  });

  it('does not stop early on a nested quote character', () => {
    expect(parse('"""He said "hi" to me."""')).toEqual(['"""He said "hi" to me."""']);
  });

  it('finds several docstrings in one file', () => {
    expect(parse('"""Module."""\n\ndef f():\n    """Function."""\n')).toEqual([
      '"""Module."""',
      '"""Function."""',
    ]);
  });

  it('ignores an inline triple-quoted string that does not start the line', () => {
    expect(parse('x = get("""value""")')).toEqual([]);
  });

  it('stops at an unterminated docstring rather than guessing', () => {
    expect(parse('"""\nnever closed\n')).toEqual([]);
  });
});
