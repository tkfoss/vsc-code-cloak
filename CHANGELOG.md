# Changelog

All notable changes to this extension are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[semantic versioning](https://semver.org/).

## [1.2.0] - 2026-08-20

### Added

- **Folding is now a feature you control.** It was previously an invisible side
  effect of hiding comments or docstrings, with no command, no setting and no
  way to opt out. There is now `codeCloak.folding.enabled`, a
  `Code Cloak: Toggle Folding` command on `Ctrl+Shift+Alt+F`, explicit
  `Fold`/`Unfold Cloaked Regions` commands, and entries in the context menu and
  the quick-pick menu.
- **Runs of consecutive whole-line comments fold into one region**
  (`codeCloak.folding.inline`). A twenty-line comment banner used to render as
  twenty stacked masks; it now collapses to a single row. A comment trailing
  real code is deliberately excluded — folding is line-based, so collapsing it
  would hide the code beside it — and stays masked in place.
- `codeCloak.folding.minimumLines` sets how many lines a region must span
  before it is folded.
- `codeCloak.folding.trimBlankLines` (default on) extends each folded region
  over the blank lines directly beneath it. Collapsing a docstring otherwise
  left the blank line that separated it from the code behind as a gap, giving
  back the space the fold had just reclaimed.
- **A `compact` hiding style**, now the default. It shrinks the mask only where
  it shares a line with code. An inline mask sits in the middle of working code,
  so a wide replacement such as `***HIDDEN***` pushed the rest of the line
  sideways — masking `: Promise<Record<string, Invoice>>` made the line *longer*
  than the code it hid, and a file of annotations stopped lining up. Those now
  collapse to one glyph (`codeCloak.appearance.compactText`, default `•`). A
  mask that owns its whole line keeps the descriptive marker instead: there is
  no alignment to protect there, and a lone glyph on an otherwise empty row
  cannot be told apart from a blank line. Set `codeCloak.appearance.style` to
  `text` for the old look.

### Changed

- **Only the opening line of a multi-line region carries a marker.** Repeating
  the placeholder down every line of a docstring drew a slab that read as
  damage rather than as one hidden thing. The remaining lines are still hidden,
  just left blank.
- The default hiding style is `compact` rather than `text`, per the above.

### Fixed

- **Regions often did not fold when a file was first opened.** `editor.fold`
  acts on VS Code's folding model, which is built asynchronously after the
  folding provider is queried — so the fold issued during activation usually
  found an empty model and did nothing, leaving the region masked but expanded.
  Folding now runs again once the editor has settled.
- **A folded docstring showed its first line in the clear.** Multi-line regions
  were left entirely to the folding layer and never masked, but a fold renders
  its opening line — so the first line of a collapsed docstring stayed on
  screen, and with folding off nothing was hidden at all. Multi-line regions
  are now masked line by line underneath the fold.
- **Panes other than the focused one were not cloaked.** Only the active editor
  was decorated, so a split view, or a layout restored at startup, left secrets
  readable in the pane beside the one being worked in.
- **Unfolding discarded the user's own folds.** `editor.unfoldAll` expanded
  every collapsed function, import block and region in the file. The folds the
  cloak made are now tracked per document and reopened individually.
- **A revealed line could drift onto a different line.** Reveals are stored as
  line numbers, so inserting or deleting lines above one slid it onto whatever
  took its place, uncloaking a value nobody chose to show. Reveals now move
  with their line, and a deleted line drops its reveal rather than passing it on.
- **`Exclude This File` wrote an absolute path into global settings**, which is
  meaningless on any other machine and follows the user there through settings
  sync. Paths inside a workspace are now stored relative to it and written to
  workspace scope.

### Performance

- The decoration cache key is a revision counter rather than a serialisation of
  the whole configuration, which was being rebuilt on every redraw of every
  visible editor.
- The decoration type is rebuilt only when the appearance settings baked into it
  change, instead of on every hide/show toggle.

## [1.1.0] - 2026-08-16

### Fixed

- **Secrets were never hidden.** The wildcard-to-regex conversion escaped the
  `.` characters it had just generated, so `*KEY*` compiled to `/^\.*KEY\.*$/i`
  and matched nothing but the literal string `KEY`. Metacharacters are now
  escaped before the wildcards are expanded.
- **`appearance.style` had no effect.** Every text style rendered the same `⋯`
  placeholder; `text`, `dots`, `stars` and `scramble` now render what they
  describe.
- **`secrets.filePatterns` was ignored**, and `.properties`, `.ini`, `.conf`,
  `.cfg` and `.toml` files had no parser at all despite being listed in the
  default patterns. The setting now gates secret scanning and those formats are
  supported.
- **`types.languages` and `comments.hideLineComments` were ignored.** Both
  settings are now honoured.
- **`vsce package` failed** because `assets/icon.png` did not exist.
- `codeCloak.showQuickPick` had a handler but was missing from the manifest, so
  it could not be invoked from the palette.
- JSON parsing required the whole document to be valid JSON, which meant
  secrets stayed visible while a file was being edited and in every `.jsonc`
  file. Parsing is now incremental and comment-aware.
- Python parameter annotations were never detected, because the scanner only
  looked for colons outside parentheses.
- Comment detection treated `//` inside a string or URL, and `#` in any
  language, as the start of a comment.
- Value positions were located with `indexOf`, which found the wrong span when
  the value also occurred earlier in the line (`TOKEN=TOKEN`).
- File exclusions matched on substrings, so excluding `/app/.env` also excluded
  `/app/.env.production`.
- Settings written by commands always targeted the global scope, silently doing
  nothing when the setting was defined in the workspace.
- Decoration types and the status bar item were never disposed.
- `toggleCurrentLine` and `addToExcludeList` were bound to keys and menus but
  only showed a "Coming soon!" message. Both are implemented.

### Changed

- The `Ctrl/Cmd+Shift+Alt` shortcuts for secrets, types, comments and
  docstrings now toggle their feature instead of only hiding it. The separate
  hide and show commands remain available in the palette.
- Feature changes report in the status bar rather than as notification popups,
  which stack up on a shared screen.
- The status bar item opens the Code Cloak menu instead of toggling directly.
- Scrambled text is derived from the value, so it no longer resamples on every
  keystroke.
- Decorations are debounced and cached per document version; folds are applied
  in a single command instead of one per range.

### Added

- Unit test suite (`npm test`) covering the parsers, pattern matching,
  decoration output and manifest consistency.
- `PropertiesParser` for `.properties`, `.ini`, `.conf`, `.cfg` and `.toml`.
- YAML block scalars (`key: |`) are cloaked line by line.
- Per-feature toggle commands and `npm run check`.

## [1.0.0] - 2025-12-10

- Initial release.
