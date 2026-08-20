# Architecture

Internal design of VSC Code Cloak. For user-facing documentation see
[README.md](README.md).

## Layers

```
extension.ts          activation, event wiring, disposal
  ConfigManager       settings + per-session visibility state
  DecorationManager   parse results -> masking decorations
  FoldingManager      parse results -> folded regions
  FoldingRangeProvider
  CommandManager      the codeCloak.* commands
  StatusBarManager    status indicator
  parsers/            source text -> ParseResult[]
```

Only `extension.ts` knows about activation. Every manager takes its
collaborators through the constructor, so each one can be built and tested in
isolation with a stub `vscode` module.

## Data flow

```
document change ──debounce 120ms──> DecorationManager.updateDocument
                                          │
                     ConfigManager gates ──┤ enabled? feature on? file excluded?
                                          │ file pattern? language? line revealed?
                                          ▼
                                     parser.parse(document) -> ParseResult[]
                                          │
                                          ▼
                       DecorationOptions[] -> editor.setDecorations
```

Folding runs on a separate path, because folds are editor state rather than a
rendering pass: `FoldingRangeProvider` publishes foldable ranges to VS Code,
and `FoldingManager` collapses them by issuing `editor.fold`. It records the
lines it folded so `unfoldAll` can reopen exactly those, leaving folds the user
made themselves closed.

## Key invariant: single-line ranges

A decoration can restyle a range but cannot remove lines, so a masked range
**must** be single-line.

Parsers may still emit multi-line results: `DecorationManager.toSingleLines`
splits them into one range per line before rendering, keeping each line's
indent so the block holds its shape. Folding consumes the unsplit ranges.

Both layers are needed, and neither is sufficient. A fold renders its opening
line, so folding alone leaves the first line of a docstring on screen; masking
alone leaves twenty masked rows where one folded row would do. Masking is the
layer that guarantees nothing is readable, and folding is the layer that makes
it compact.

`PythonASTParser` and `TypeScriptASTParser` still discard annotations that wrap
across lines: an annotation is not prose, and splitting one across lines would
mask the code interleaved with it.

## Masking mechanism

`text`, `dots`, `stars` and `scramble` hide the original range with
`textDecoration: 'none; display: none'` and draw the replacement as a `before`
pseudo-element. `display: none` — rather than transparency — is what keeps the
original text out of the layout, so the replacement is not drawn beside the
value it replaces.

`blur` and `block` paint over the text in place and therefore preserve its
width, which reveals the length of what they cover. That trade-off is the
user's to make; it is documented in the README rather than hidden.

## Parsers

Every parser extends `BaseParser`:

```ts
canParse(document): boolean
parse(document): ParseResult[]
```

`ParseResult.kind` routes the result to a feature toggle. `ParseResult.key`
carries the key name for secrets and `'line'`/`'block'` for comments, so the two
`comments.*` settings can be honoured independently.

`BaseParser.readValue` is shared by the key/value parsers. It resolves a value
span from a delimiter position rather than searching for the value's text: an
`indexOf` search finds the wrong span whenever the value also occurs earlier in
the line, as in `TOKEN=TOKEN`.

| Parser | Approach |
|---|---|
| `EnvParser`, `PropertiesParser` | Line regex for the key, `readValue` for the span |
| `JsonParser` | Character scanner. Deliberately avoids `JSON.parse`: a file being edited is invalid most of the time, and refusing to parse would unhide secrets exactly while they are typed |
| `YamlParser` | Line-oriented, with block-scalar continuation emitted line by line |
| `TypeScriptASTParser` | `ts.createSourceFile` and a visitor; does not descend into a type node it has already reported, to avoid overlapping decorations |
| `PythonASTParser` | Offset scanner over the whole document, so wrapped signatures parse correctly. Signature spans are recorded and skipped by the variable-annotation pass, which would otherwise match a wrapped parameter twice |
| `CommentParser` | Per-language delimiter table plus string tracking, so a delimiter inside a literal is not a comment |
| `DocstringParser` | Triple-quoted strings that begin a line |

### Adding a secret format

1. Subclass `BaseParser`, using `readValue` for the value span.
2. Register it in `DecorationManager.secretParsers` (first match wins).
3. Add its extension to the `codeCloak.secrets.filePatterns` default in
   `package.json` — the file gate runs before `canParse`, so a parser not
   covered by a default pattern is unreachable out of the box.
4. Add a case to `test/secretParsers.test.ts`.

## Performance

- Edits are debounced by 120 ms; without it the TypeScript parser rebuilds a
  full AST on every keystroke.
- `DecorationManager` caches decorations per `(document version, revision)`.
  `ConfigManager.getRevision()` is a counter bumped by every mutator, so a
  settings change invalidates the cache without a separate notification path.
  It was a `JSON.stringify` of the whole config, which ran on every redraw of
  every visible editor — including cache hits.
- The decoration type is rebuilt only when the appearance settings baked into it
  change. Disposing one drops its decorations from every editor at once, which
  flickered the masks off and back on for an ordinary hide/show toggle.
- Glob patterns compile to `RegExp` once and are cached until settings reload.
- `FoldingManager` folds every range in one `editor.fold` call. Folding them
  one at a time moves the cursor repeatedly and scrolls the document.

## Dependencies

`typescript` is a **runtime** dependency, not just a build tool: the TypeScript
parser calls `ts.createSourceFile` at runtime. Only `lib/typescript.js` is
needed, so `.vscodeignore` strips the compiler CLI, the language server and the
bundled `lib.*.d.ts` declarations from the VSIX (4.3 MB → 1.6 MB). Calling
`ts.createProgram` would need those declarations back.

## Testing

`npm test` runs Jest against the parsers and managers. The real `vscode` module
only exists inside the extension host, so `jest.config.js` maps `vscode` to
`test/vscode.ts`, a stub implementing the small surface the extension uses.

`test/manifest.test.ts` cross-checks `package.json` against the code: every
contributed command has a handler, every registered command is contributed, and
keybindings and menus reference commands that exist. A command registered but
not contributed is invisible in the palette, which is how
`codeCloak.showQuickPick` went unreachable before 1.1.0.

## Known trade-offs

- Folds are ordinary editor folds, so an unrelated `Unfold All` reveals them.
  Nothing is exposed by that: the masking underneath is independent, so the
  region is shown masked rather than collapsed.
- A comment trailing code cannot be folded, only masked. Folding is line-based,
  so collapsing that line would hide the code beside it.
- Values are briefly visible between a keystroke and the debounced redraw.
- `DocstringParser` treats any triple-quoted string that begins a line as a
  docstring. Broader than PEP 257, and the safer default here.
