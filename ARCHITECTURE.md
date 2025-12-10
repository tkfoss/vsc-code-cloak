# VSC Code Cloak - Architecture Documentation

## Overview

VSC Code Cloak is a comprehensive Visual Studio Code extension that combines features from multiple code privacy extensions into a unified solution. It allows hiding secrets, type annotations, comments, and docstrings during screen sharing, streaming, or recording.

## Repository Analysis Summary

This extension was built by analyzing and combining the best features from 5 existing repositories:

### 1. Camouflage (zeybek/camouflage)
- **Focus**: Multi-format configuration file secret hiding
- **Features Used**:
  - Multiple file format support (.env, .json, .yaml, .properties, .toml, .sh)
  - Multiple hiding styles (text, dotted, stars, scramble)
  - Selective hiding with pattern matching
  - Context menu integration
  - Status bar indicator
  - Keyboard shortcuts

### 2. Censitive (1nVitr0/plugin-vscode-censitive)
- **Focus**: Custom `.censitive` config file approach
- **Features Used**:
  - Regex-based key-value detection
  - Fenced censoring concept
  - Code action providers

### 3. Toggle Docstrings (GrayRigel/toggle-docstrings)
- **Focus**: Python/Jupyter docstring visibility
- **Features Used**:
  - Docstring detection and hiding
  - Simple toggle mechanism

### 4. Cloak (johnpapa/vscode-cloak)
- **Focus**: Basic .env file hiding
- **Features Used**:
  - TextMateRules approach
  - Simple command structure
  - Extension dependency concept

### 5. vsc-code-cloak (this repository)
- **Original State**: Empty repository with basic README
- **New State**: Fully functional extension with unified features

## Architecture

### Project Structure

```
vsc-code-cloak/
├── src/
│   ├── extension.ts              # Main entry point
│   ├── config/
│   │   └── ConfigManager.ts      # Configuration management
│   ├── commands/
│   │   └── CommandManager.ts     # Command registration and handling
│   ├── decorations/
│   │   └── DecorationManager.ts  # Text decoration management
│   ├── parsers/
│   │   ├── BaseParser.ts         # Abstract parser base class
│   │   ├── EnvParser.ts          # .env file parser
│   │   ├── JsonParser.ts         # JSON file parser
│   │   ├── YamlParser.ts         # YAML file parser
│   │   ├── TypeAnnotationParser.ts # TypeScript/Python type parser
│   │   ├── CommentParser.ts      # Comment parser
│   │   └── DocstringParser.ts    # Python docstring parser
│   └── ui/
│       └── StatusBarManager.ts   # Status bar indicator
├── package.json                   # Extension manifest
├── tsconfig.json                  # TypeScript configuration
├── .eslintrc.json                 # ESLint configuration
├── .prettierrc                    # Prettier configuration
├── .gitignore                     # Git ignore rules
├── LICENSE                        # MIT License
├── README.md                      # User documentation
└── ARCHITECTURE.md                # This file

Compiled Output:
├── out/                           # Compiled JavaScript
```

### Core Components

#### 1. Extension.ts
- **Purpose**: Main extension activation and lifecycle management
- **Responsibilities**:
  - Initialize managers (Config, Decoration, StatusBar, Command)
  - Register event handlers for editor changes
  - Handle configuration updates
  - Coordinate between components

#### 2. ConfigManager
- **Purpose**: Centralized configuration management
- **Features**:
  - Load and reload VS Code settings
  - Manage feature states (secrets, types, comments, docstrings)
  - Pattern matching for key detection
  - File exclusion management
  - Exclude key list management

#### 3. DecorationManager
- **Purpose**: Apply visual decorations to hide content
- **Features**:
  - Multiple decoration styles (text, dots, stars, scramble, blur, block)
  - Coordinate multiple parsers
  - Create and manage TextEditorDecorations
  - Handle hover messages
  - Refresh decorations on config changes

#### 4. CommandManager
- **Purpose**: Handle all extension commands
- **Commands**:
  - Main toggle: enable/disable/toggle
  - Feature toggles: secrets, types, comments, docstrings
  - File management: exclude/include file
  - Style change: change hiding style
  - Line operations: toggle current line, add to exclude list

#### 5. StatusBarManager
- **Purpose**: Display extension status in status bar
- **Features**:
  - Show enabled/disabled state
  - Display active features
  - Click to toggle extension
  - Warning indicator when features active

#### 6. Parsers
All parsers extend `BaseParser` and implement:
- `canParse(document)`: Check if parser can handle document
- `parse(document)`: Extract content to hide

**Parser Types**:
- **EnvParser**: Handles .env files, export statements
- **JsonParser**: Handles JSON key-value pairs
- **YamlParser**: Handles YAML key-value pairs
- **TypeAnnotationParser**: Handles TypeScript/Python type annotations
- **CommentParser**: Handles single-line and block comments
- **DocstringParser**: Handles Python triple-quoted docstrings

## Features

### 1. Multi-Feature Support
- Secrets hiding in configuration files
- Type annotation hiding in TypeScript/Python
- Comment hiding (single-line and block)
- Docstring hiding in Python

### 2. Multiple Hiding Styles
- **Text**: Replace with custom text
- **Dots**: Replace with bullet points
- **Stars**: Replace with asterisks
- **Scramble**: Randomly shuffle characters
- **Blur**: Apply CSS blur filter
- **Block**: Solid color block

### 3. Smart Pattern Matching
- Wildcard support: `*KEY*`, `KEY*`, `*KEY`
- Case-insensitive matching
- Exclude list to prevent hiding specific keys
- File exclusion support

### 4. User Interface
- Status bar indicator with active features
- Context menu integration
- Keyboard shortcuts
- Command palette commands
- Hover preview (optional)

## Configuration

### Key Settings

```typescript
{
  enabled: boolean;              // Master enable/disable
  autoHide: boolean;             // Auto-hide on file open
  features: {
    secrets: boolean;            // Enable secret hiding
    types: boolean;              // Enable type hiding
    comments: boolean;           // Enable comment hiding
    docstrings: boolean;         // Enable docstring hiding
  };
  secrets: {
    filePatterns: string[];      // File patterns to scan
    keyPatterns: string[];       // Patterns for keys to hide
    excludeKeys: string[];       // Keys to never hide
  };
  appearance: {
    style: string;               // Hiding style
    hiddenText: string;          // Replacement text
    textColor: string;           // Text color
    backgroundColor: string;     // Background color
    opacity: number;             // Opacity for blur
  };
}
```

## Extension Points

### Commands
All commands are prefixed with `codeCloak.`:
- `enable`, `disable`, `toggle`
- `hideSecrets`, `showSecrets`
- `hideTypes`, `showTypes`
- `hideComments`, `showComments`
- `hideDocstrings`, `showDocstrings`
- `toggleCurrentLine`, `addToExcludeList`
- `excludeFile`, `includeFile`
- `changeStyle`

### Keyboard Shortcuts
- `Ctrl+Shift+Alt+H`: Toggle extension
- `Ctrl+Shift+Alt+S`: Toggle secrets
- `Ctrl+Shift+Alt+T`: Toggle types
- `Ctrl+Shift+Alt+C`: Toggle comments
- `Ctrl+Shift+Alt+D`: Toggle docstrings
- `Ctrl+Shift+Alt+L`: Toggle current line

### Context Menu
Submenu under "Code Cloak" with all commands organized by function.

## Technical Details

### Dependencies
- **Runtime**: VS Code API only (no external runtime dependencies)
- **Development**:
  - TypeScript 5.4+
  - ESLint 8+
  - Prettier 3+
  - Jest 29+ (for testing)
  - @vscode/vsce (for packaging)

### Performance Considerations
- Parsers run on document change (throttled by VS Code)
- Decorations are editor-specific (not document-specific)
- Pattern matching uses compiled RegExp
- Large files may experience brief delays

### Limitations
- Visual hiding only (doesn't modify files)
- Brief delay on file open before hiding
- Complex syntax may not parse correctly
- Decorations may flicker on editor switch

## Development

### Building
```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript
npm run watch        # Watch mode for development
```

### Testing
```bash
npm run test         # Run tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

### Packaging
```bash
npm run package      # Create .vsix file
```

## Future Enhancements

Potential features to consider:
1. Custom regex patterns for secret detection
2. Language-specific parsers (Ruby, PHP, Go, etc.)
3. Export/import configuration profiles
4. Workspace-specific settings
5. Team sharing of .censor config files
6. Performance optimization for large files
7. Better syntax tree parsing
8. Integration with secret scanning tools
9. Temporary reveal on hover (with delay)
10. Toggle by selection

## Credits

Built with inspiration from:
- Camouflage by Ahmet Zeybek
- Cloak by John Papa
- Censitive by 1nVitr0
- Toggle Docstrings by GrayRigel

## License

MIT License - See LICENSE file for details
