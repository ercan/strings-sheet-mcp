# strings-sheet-mcp

MCP server for managing localization strings in Google Sheets. Designed for use with Claude Code to add, update, and delete string keys and translations, organized by feature categories.

## Sheet Structure

| Column A | Column B | Column C | Column D | Column E | Column F | Column G | Column H | Column I |
|----------|----------|----------|----------|----------|----------|----------|----------|----------|
| Feature header | Key | English | German | French | Spanish | Italian | Portuguese | Turkish |

- **Column A** contains feature/category headers (e.g., `// MainMenu`, `// General`, `Login`)
- **Column B** contains string keys (e.g., `login_screen_title`)
- **Columns C–I** contain translations per language

### Sample

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| // MainMenu | | | | | | | | |
| | main_menu_bottom_nav_play | Play | Spielen | Jouer | Jugar | Gioca | Jogar | Oyna |
| | main_menu_bottom_nav_rankings | Ranks | Ränge | Rangs | Rangos | Classifiche | Classificações | Sıralamalar |
| | main_menu_bottom_nav_profile | Profile | Profil | Profil | Perfil | Profilo | Perfil | Profil |
| | main_menu_bottom_nav_stats | Stats | Statistiken | Statistiques | Estadísticas | Statistiche | Estatísticas | İstatistikler |
| | main_menu_bottom_nav_shop | Shop | Geschäft | Boutique | Comercio | Negozio | Comprar | Mağaza |
| // General | | | | | | | | |
| | app_name | My App | Meine App | Mon Appli | Mi App | La Mia App | Meu App | Uygulamam |
| | general_error_no_internet_connection | Please check your internet connection | Bitte überprüfen Sie Ihre Internetverbindung. | Veuillez vérifier votre connexion Internet. | Por favor, compruebe su conexión a Internet. | Si prega di controllare la connessione Internet | Por favor, verifique sua conexão com a internet. | Lütfen internet bağlantınızı kontrol edin. |
| | general_confirm | Confirm | Bestätigen | Confirmer | Confirmar | Confermare | Confirmar | Onaylamak |
| Login | | | | | | | | |
| | login_screen_app_name | MY APP | MEINE APP | MON APPLI | MI APP | LA MIA APP | MEU APP | UYGULAMAM |
| | login_screen_continue_with_google | Continue with Google | Mit Google fortfahren | Continuer avec Google | Continuar con Google | Continua con Google | Continuar com o Google | Google ile devam edin |

## Tools

| Tool | Description |
|------|-------------|
| `list_features` | List all feature/category sections and their keys |
| `get_strings` | Read strings, optionally filtered by feature or key pattern |
| `add_strings` | Add new string entries under a feature section (creates section if needed) |
| `update_strings` | Update translations for existing keys |
| `delete_strings` | Delete string entries by key |

## Setup

### 1. Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API** (APIs & Services → Enable APIs)
4. Go to **IAM & Admin → Service Accounts** → Create a service account
5. Create a JSON key for it (Actions → Manage Keys → Add Key → JSON) and save the file somewhere safe, e.g. `~/.config/gcloud/strings-sheet-sa.json`

### 2. Share your Google Sheet

Open your strings spreadsheet → **Share** → add the service account email (looks like `something@your-project.iam.gserviceaccount.com`) with **Editor** access.

### 3. Get your Spreadsheet ID

From the sheet URL: `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

### 4. Build

```bash
npm install
npm run build
```

### 5. Configure in Claude Code

Add to your `.claude.json` or `.claude/settings.json`:

```json
{
  "mcpServers": {
    "strings-sheet": {
      "command": "node",
      "args": ["/path/to/strings-sheet-mcp/dist/index.js"],
      "env": {
        "SPREADSHEET_ID": "your-spreadsheet-id",
        "SERVICE_ACCOUNT_JSON_PATH": "/path/to/service-account.json",
        "SHEET_NAME": "Sheet1"
      }
    }
  }
}
```

Restart Claude Code and the tools will be available in your conversations.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SPREADSHEET_ID` | Yes | Google Sheet ID from the URL |
| `SERVICE_ACCOUNT_JSON_PATH` | Yes | Path to the service account JSON key file |
| `SHEET_NAME` | No | Sheet tab name (defaults to `Sheet1`) |
