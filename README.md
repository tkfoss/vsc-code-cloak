# VSC Code Cloak

**Universal code privacy extension for Visual Studio Code**

Hide secrets, type annotations, comments, docstrings and more during screen sharing, streaming, or recording.

## Features

VSC Code Cloak is a comprehensive privacy extension that combines the best features from multiple code hiding extensions:

### Multi-Feature Support

- **Secrets Hiding**: Hide sensitive values in configuration files (.env, .json, .yaml, .properties, .toml, .sh)
- **Type Annotations**: Hide TypeScript/Python type annotations for cleaner presentations
- **Comments**: Hide single-line and block comments
- **Docstrings**: Hide Python docstrings

### Multiple Hiding Styles

Choose from various hiding styles to match your preference:

- **Text**: Replace with custom text (e.g., `***HIDDEN***`)
- **Dots**: Replace with dots (`••••••••••••`)
- **Stars**: Replace with asterisks (`************`)
- **Scramble**: Randomly shuffle characters
- **Blur**: Apply blur effect to content
- **Block**: Solid block covering content

### Smart Pattern Matching

- Configurable key patterns for secret detection
- Wildcard support (`*KEY*`, `*TOKEN*`, `*PASSWORD*`)
- Exclude list for public values
- File exclusion support

### User-Friendly Interface

- Status bar indicator showing active features
- Quick toggle via keyboard shortcuts
- Context menu integration
- Hover preview (optional)

## Installation

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P`
3. Type `ext install vsc-code-cloak`
4. Press Enter

## Quick Start

1. Open a file with secrets (e.g., `.env`, `.json`)
2. Use `Ctrl+Shift+Alt+H` / `Cmd+Shift+Alt+H` to toggle Code Cloak
3. Use `Ctrl+Shift+Alt+S` / `Cmd+Shift+Alt+S` to hide/show secrets

## Keyboard Shortcuts

| Command | Windows/Linux | macOS | Description |
|---------|--------------|-------|-------------|
| Toggle Extension | `Ctrl+Shift+Alt+H` | `Cmd+Shift+Alt+H` | Enable/disable Code Cloak |
| Toggle Secrets | `Ctrl+Shift+Alt+S` | `Cmd+Shift+Alt+S` | Hide/show secrets |
| Toggle Types | `Ctrl+Shift+Alt+T` | `Cmd+Shift+Alt+T` | Hide/show type annotations |
| Toggle Comments | `Ctrl+Shift+Alt+C` | `Cmd+Shift+Alt+C` | Hide/show comments |
| Toggle Docstrings | `Ctrl+Shift+Alt+D` | `Cmd+Shift+Alt+D` | Hide/show docstrings |
| Toggle Current Line | `Ctrl+Shift+Alt+L` | `Cmd+Shift+Alt+L` | Toggle current line visibility |

## Configuration

Access settings via: `Preferences: Open Settings (UI)` → Search for "Code Cloak"

### Main Settings

```json
{
  "codeCloak.enabled": true,
  "codeCloak.autoHide": true,
  "codeCloak.features.secrets": true,
  "codeCloak.features.types": false,
  "codeCloak.features.comments": false,
  "codeCloak.features.docstrings": false
}
```

### Secret Patterns

```json
{
  "codeCloak.secrets.keyPatterns": [
    "*KEY*",
    "*TOKEN*",
    "*SECRET*",
    "*PASSWORD*",
    "*API*",
    "*DB*",
    "*CREDENTIAL*",
    "*AUTH*",
    "*PRIVATE*"
  ],
  "codeCloak.secrets.excludeKeys": [
    "PUBLIC*",
    "*_TEST",
    "DEBUG",
    "NODE_ENV"
  ]
}
```

### Appearance

```json
{
  "codeCloak.appearance.style": "text",
  "codeCloak.appearance.hiddenText": "***HIDDEN***",
  "codeCloak.appearance.textColor": "auto",
  "codeCloak.appearance.backgroundColor": "auto",
  "codeCloak.appearance.opacity": 0.3
}
```

## Supported File Types

### Secrets Detection

- Environment files: `.env`, `.env.*`, `.envrc`
- JSON: `.json`, `.jsonc`
- YAML: `.yaml`, `.yml`
- Properties: `.properties`, `.ini`, `.conf`
- TOML: `.toml`
- Shell scripts: `.sh`

### Type Annotations

- TypeScript: `.ts`, `.tsx`
- Python: `.py`

### Docstrings

- Python: `.py`
- Jupyter: `.ipynb`

## Examples

### Environment Files

```env
# Before hiding
API_KEY=sk-1234567890abcdef
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# After hiding
API_KEY=***HIDDEN***
DATABASE_URL=***HIDDEN***
```

### TypeScript

```typescript
// Before hiding (types visible)
function greet(name: string): string {
  return `Hello, ${name}`;
}

// After hiding (types hidden)
function greet(name) {
  return `Hello, ${name}`;
}
```

### Python Docstrings

```python
# Before hiding
def calculate(x, y):
    """
    Calculate the sum of two numbers.

    Args:
        x: First number
        y: Second number

    Returns:
        Sum of x and y
    """
    return x + y

# After hiding (docstring hidden)
def calculate(x, y):
    return x + y
```

## Use Cases

Perfect for:

- Live coding presentations
- Streaming on Twitch/YouTube
- Recording screencasts
- Teaching and tutorials
- Code reviews with sensitive data
- Sharing screenshots

## Privacy & Security

**Important**: Code Cloak only hides content visually in the editor. It does NOT:

- Modify your actual files
- Store any sensitive information
- Encrypt or secure your data
- Prevent copying or accessing the original values

Always review what you're sharing and use proper security practices.

## Commands

Access via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Code Cloak: Enable`
- `Code Cloak: Disable`
- `Code Cloak: Toggle`
- `Code Cloak: Hide Secrets`
- `Code Cloak: Show Secrets`
- `Code Cloak: Hide Type Annotations`
- `Code Cloak: Show Type Annotations`
- `Code Cloak: Hide Comments`
- `Code Cloak: Show Comments`
- `Code Cloak: Hide Docstrings`
- `Code Cloak: Show Docstrings`
- `Code Cloak: Change Hiding Style`
- `Code Cloak: Exclude This File`
- `Code Cloak: Include This File`

## Context Menu

Right-click in any supported file to access Code Cloak options:

```
Code Cloak
├── Enable/Disable
├── Hide/Show Secrets
├── Hide/Show Types
├── Hide/Show Comments
├── Hide/Show Docstrings
├── Toggle Current Line
├── Add to Exclude List
├── Exclude/Include This File
└── Change Style
```

## Requirements

- VS Code 1.96.0 or higher
- Node.js 18.0.0 or higher (for development)

## Known Limitations

- There is a brief delay when opening files before content is hidden
- Very large files may experience performance issues
- Some complex syntax may not be parsed correctly
- Decorations may flicker when switching between files

## Contributing

Contributions are welcome! Please see the repository for contribution guidelines.

## Credits

Inspired by and built upon concepts from:

- [Camouflage](https://marketplace.visualstudio.com/items?itemName=zeybek.camouflage) by Ahmet Zeybek
- [Cloak](https://marketplace.visualstudio.com/items?itemName=johnpapa.vscode-cloak) by John Papa
- [Censitive](https://marketplace.visualstudio.com/items?itemName=1nVitr0.censitive) by 1nVitr0
- [Toggle Docstrings](https://marketplace.visualstudio.com/items?itemName=GrayRigel.toggle-docstrings)

## License

MIT License - See LICENSE file for details

## Support

- Report issues: [GitHub Issues](https://github.com/vsc-code-cloak/vsc-code-cloak/issues)
- Feature requests: [GitHub Discussions](https://github.com/vsc-code-cloak/vsc-code-cloak/discussions)

---

**Enjoy your privacy with VSC Code Cloak!**
