# CLAUDE.md

## Project Overview

`strings-sheet-mcp` is an MCP (Model Context Protocol) server that manages localization strings in a Google Sheet. It is designed for use with Claude Code to add, update, and delete string keys and translations.

## Build & Run

```bash
npm install
npm run build        # compiles TypeScript to dist/
npm run start        # runs the server (requires env vars)
npm run dev          # watches for changes and recompiles
```

The compiled entry point is `dist/index.js`.

## Installation in Claude Code

### Prerequisites

1. **Node.js** installed
2. **Google Cloud service account** with Sheets API enabled and a JSON key file
3. **Google Sheet** shared with the service account email (Editor access)
4. **Spreadsheet ID** from the sheet URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

### Steps

1. Clone this repo and build:
   ```bash
   git clone <this-repo-url> ~/Developer/strings-sheet-mcp
   cd ~/Developer/strings-sheet-mcp
   npm install && npm run build
   ```

2. Add to Claude Code's **user-level** config (`~/.claude.json`). Merge the `mcpServers` key into the existing JSON (don't overwrite the file):
   ```json
   {
     "mcpServers": {
       "strings-sheet": {
         "type": "stdio",
         "command": "node",
         "args": ["/absolute/path/to/strings-sheet-mcp/dist/index.js"],
         "env": {
           "SPREADSHEET_ID": "<your-spreadsheet-id>",
           "SERVICE_ACCOUNT_JSON_PATH": "/absolute/path/to/service-account.json",
           "SHEET_NAME": "Sheet1"
         }
       }
     }
   }
   ```

3. Restart Claude Code. The tools (`list_features`, `get_strings`, `add_strings`, `update_strings`, `delete_strings`) will be available.

### Common Mistakes

- **Wrong config location:** The user-level MCP config goes in `~/.claude.json` (top-level `mcpServers` key), NOT in `~/.claude/.mcp.json`.
- **Env vars as args:** Environment variables must be in the `env` object. Do NOT pass them as `-e` flags in `args`.
- **Relative paths:** Use absolute paths for both the server script and the service account JSON file.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SPREADSHEET_ID` | Yes | Google Sheet ID from the URL |
| `SERVICE_ACCOUNT_JSON_PATH` | Yes | Absolute path to the service account JSON key file |
| `SHEET_NAME` | No | Sheet tab name (defaults to `Sheet1`) |

## Architecture

- **Runtime:** Node.js (ES modules)
- **Language:** TypeScript, compiled to `dist/`
- **Dependencies:** `@modelcontextprotocol/sdk`, `googleapis`, `zod`
- **Transport:** stdio (Claude Code launches the process and communicates via stdin/stdout)

## Sheet Structure

| Column A | Column B | Columns C-I |
|----------|----------|-------------|
| Feature header (e.g. `// Profile`) | String key | Translations (English, German, French, Spanish, Italian, Portuguese, Turkish) |

- Row 1 is the header row — never modify it
- New features go at the bottom of the sheet
- Key naming convention: `{feature}_screen_{purpose}` (e.g. `profile_screen_stats_title`)
