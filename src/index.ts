#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google, sheets_v4 } from "googleapis";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

// --- Configuration ---

const SPREADSHEET_ID = process.env.SPREADSHEET_ID ?? "";
const SERVICE_ACCOUNT_JSON_PATH = process.env.SERVICE_ACCOUNT_JSON_PATH ?? "";
const SHEET_NAME = process.env.SHEET_NAME ?? "Sheet1";

const LANGUAGES = [
  "English",
  "German",
  "French",
  "Spanish",
  "Italian",
  "Portuguese",
  "Turkish",
] as const;

type Language = (typeof LANGUAGES)[number];

// Column mapping: A=0, B=1, C=2, ...
const COL_FEATURE = 0; // Column A - feature/category headers
const COL_KEY = 1; // Column B - string keys
const COL_LANG_START = 2; // Column C onwards - translations

// --- Google Sheets Client ---

let sheetsClient: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;

  if (!SERVICE_ACCOUNT_JSON_PATH) {
    throw new Error(
      "SERVICE_ACCOUNT_JSON_PATH environment variable is required"
    );
  }
  if (!SPREADSHEET_ID) {
    throw new Error("SPREADSHEET_ID environment variable is required");
  }

  const keyFilePath = path.resolve(SERVICE_ACCOUNT_JSON_PATH);
  if (!fs.existsSync(keyFilePath)) {
    throw new Error(
      `Service account JSON file not found at: ${keyFilePath}`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

// --- Sheet Helpers ---

interface SheetData {
  rows: (string | undefined)[][];
}

async function getSheetData(): Promise<SheetData> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = (response.data.values ?? []) as (string | undefined)[][];
  return { rows };
}

interface FeatureSection {
  name: string;
  headerRow: number; // 0-indexed row number
  keys: { key: string; row: number; translations: Record<Language, string> }[];
}

function parseSheet(data: SheetData): FeatureSection[] {
  const features: FeatureSection[] = [];
  let currentFeature: FeatureSection | null = null;

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const colA = (row[COL_FEATURE] ?? "").toString().trim();
    const colB = (row[COL_KEY] ?? "").toString().trim();

    // Check if this is a header row (column A has content, column B is empty or is "Key")
    if (colA && (!colB || colB === "Key")) {
      // This is a feature header or the column header row
      if (colB === "Key") continue; // Skip the column header row

      const featureName = colA.replace(/^\/\/\s*/, "").trim();
      currentFeature = {
        name: featureName,
        headerRow: i,
        keys: [],
      };
      features.push(currentFeature);
      continue;
    }

    // Check if this is a string entry row (column B has a key)
    if (colB && currentFeature) {
      const translations: Record<string, string> = {};
      for (let langIdx = 0; langIdx < LANGUAGES.length; langIdx++) {
        const colIdx = COL_LANG_START + langIdx;
        translations[LANGUAGES[langIdx]] = (row[colIdx] ?? "").toString();
      }
      currentFeature.keys.push({
        key: colB,
        row: i,
        translations: translations as Record<Language, string>,
      });
    }
  }

  return features;
}

function findFeatureInsertRow(
  features: FeatureSection[],
  featureName: string
): { found: boolean; insertRow: number; featureHeaderRow?: number } {
  const normalizedName = featureName.toLowerCase().replace(/^\/\/\s*/, "").trim();

  for (const feature of features) {
    if (feature.name.toLowerCase() === normalizedName) {
      // Insert after the last key in this feature, or after the header if no keys
      const lastKeyRow =
        feature.keys.length > 0
          ? feature.keys[feature.keys.length - 1].row
          : feature.headerRow;
      return {
        found: true,
        insertRow: lastKeyRow + 1,
        featureHeaderRow: feature.headerRow,
      };
    }
  }

  // Feature not found — insert at the very end
  return { found: false, insertRow: -1 };
}

async function insertRows(
  startRow: number,
  rows: (string | undefined)[][]
): Promise<void> {
  const sheets = getSheetsClient();

  // Get spreadsheet to find sheetId
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });

  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === SHEET_NAME
  );
  const sheetId = sheet?.properties?.sheetId ?? 0;

  // Insert empty rows first
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: startRow,
              endIndex: startRow + rows.length,
            },
            inheritFromBefore: false,
          },
        },
      ],
    },
  });

  // Write data into the inserted rows
  const range = `${SHEET_NAME}!A${startRow + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: {
      values: rows,
    },
  });
}

async function appendRows(rows: (string | undefined)[][]): Promise<void> {
  const data = await getSheetData();
  const lastRow = data.rows.length;
  await insertRows(lastRow, rows);
}

// --- MCP Server ---

const server = new McpServer({
  name: "strings-sheet-mcp",
  version: "1.0.0",
});

// Tool: list_features
server.tool(
  "list_features",
  "List all feature/category sections in the strings sheet",
  {},
  async () => {
    const data = await getSheetData();
    const features = parseSheet(data);

    const result = features.map((f) => ({
      name: f.name,
      keyCount: f.keys.length,
      keys: f.keys.map((k) => k.key),
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Tool: get_strings
server.tool(
  "get_strings",
  "Get string entries from the sheet, optionally filtered by feature name or key pattern",
  {
    feature: z
      .string()
      .optional()
      .describe("Filter by feature/category name (e.g., 'MainMenu', 'Login')"),
    keyPattern: z
      .string()
      .optional()
      .describe("Filter keys containing this substring"),
  },
  async ({ feature, keyPattern }) => {
    const data = await getSheetData();
    const features = parseSheet(data);

    let filtered = features;

    if (feature) {
      const normalizedFeature = feature.toLowerCase().replace(/^\/\/\s*/, "").trim();
      filtered = filtered.filter(
        (f) => f.name.toLowerCase() === normalizedFeature
      );
    }

    const results: {
      feature: string;
      key: string;
      translations: Record<Language, string>;
    }[] = [];

    for (const f of filtered) {
      for (const k of f.keys) {
        if (keyPattern && !k.key.includes(keyPattern)) continue;
        results.push({
          feature: f.name,
          key: k.key,
          translations: k.translations,
        });
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }
);

// Tool: add_strings
server.tool(
  "add_strings",
  `Add one or more localization string entries to the Google Sheet.
Each entry needs a key and translations for available languages: ${LANGUAGES.join(", ")}.
Entries are placed under the specified feature category section.
If the feature section doesn't exist, it will be created.`,
  {
    feature: z
      .string()
      .describe(
        "Feature/category name (e.g., 'MainMenu', 'Login', 'General'). Will be prefixed with '// ' as section header if creating new."
      ),
    entries: z
      .array(
        z.object({
          key: z.string().describe("The string key (e.g., 'login_screen_title')"),
          english: z.string().optional().describe("English translation"),
          german: z.string().optional().describe("German translation"),
          french: z.string().optional().describe("French translation"),
          spanish: z.string().optional().describe("Spanish translation"),
          italian: z.string().optional().describe("Italian translation"),
          portuguese: z.string().optional().describe("Portuguese translation"),
          turkish: z.string().optional().describe("Turkish translation"),
        })
      )
      .describe("Array of string entries to add"),
  },
  async ({ feature, entries }) => {
    const data = await getSheetData();
    const features = parseSheet(data);

    // Check for duplicate keys
    const existingKeys = new Set<string>();
    for (const f of features) {
      for (const k of f.keys) {
        existingKeys.add(k.key);
      }
    }

    const duplicates = entries.filter((e) => existingKeys.has(e.key));
    if (duplicates.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: The following keys already exist in the sheet: ${duplicates.map((d) => d.key).join(", ")}. Use update_strings to modify existing entries.`,
          },
        ],
        isError: true,
      };
    }

    const { found, insertRow } = findFeatureInsertRow(features, feature);

    // Build row data
    const rowsToInsert: (string | undefined)[][] = [];

    if (!found) {
      // Add feature header row
      const featureHeader = feature.startsWith("//")
        ? feature
        : `// ${feature}`;
      rowsToInsert.push([featureHeader]);
    }

    for (const entry of entries) {
      const row: (string | undefined)[] = [
        "", // Column A (empty for string rows)
        entry.key, // Column B
        entry.english ?? "",
        entry.german ?? "",
        entry.french ?? "",
        entry.spanish ?? "",
        entry.italian ?? "",
        entry.portuguese ?? "",
        entry.turkish ?? "",
      ];
      rowsToInsert.push(row);
    }

    if (found) {
      await insertRows(insertRow, rowsToInsert);
    } else {
      // Append at the end of the sheet
      await appendRows(rowsToInsert);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully added ${entries.length} string(s) under feature "${feature}".${!found ? " (New feature section created)" : ""}\n\nKeys added: ${entries.map((e) => e.key).join(", ")}`,
        },
      ],
    };
  }
);

// Tool: update_strings
server.tool(
  "update_strings",
  `Update existing string entries in the Google Sheet.
Only provided translations will be updated; others remain unchanged.`,
  {
    entries: z
      .array(
        z.object({
          key: z
            .string()
            .describe("The string key to update (must already exist)"),
          english: z.string().optional().describe("English translation"),
          german: z.string().optional().describe("German translation"),
          french: z.string().optional().describe("French translation"),
          spanish: z.string().optional().describe("Spanish translation"),
          italian: z.string().optional().describe("Italian translation"),
          portuguese: z.string().optional().describe("Portuguese translation"),
          turkish: z.string().optional().describe("Turkish translation"),
        })
      )
      .describe("Array of string entries to update"),
  },
  async ({ entries }) => {
    const sheets = getSheetsClient();
    const data = await getSheetData();
    const features = parseSheet(data);

    // Build key-to-row map
    const keyRowMap = new Map<string, number>();
    for (const f of features) {
      for (const k of f.keys) {
        keyRowMap.set(k.key, k.row);
      }
    }

    const notFound: string[] = [];
    const updateRequests: sheets_v4.Schema$ValueRange[] = [];

    const langFieldMap: Record<string, number> = {
      english: COL_LANG_START,
      german: COL_LANG_START + 1,
      french: COL_LANG_START + 2,
      spanish: COL_LANG_START + 3,
      italian: COL_LANG_START + 4,
      portuguese: COL_LANG_START + 5,
      turkish: COL_LANG_START + 6,
    };

    for (const entry of entries) {
      const row = keyRowMap.get(entry.key);
      if (row === undefined) {
        notFound.push(entry.key);
        continue;
      }

      const sheetRow = row + 1; // 1-indexed for A1 notation

      for (const [langField, colIdx] of Object.entries(langFieldMap)) {
        const value = entry[langField as keyof typeof entry];
        if (value !== undefined) {
          const colLetter = String.fromCharCode(65 + colIdx); // A=65
          updateRequests.push({
            range: `${SHEET_NAME}!${colLetter}${sheetRow}`,
            values: [[value]],
          });
        }
      }
    }

    if (notFound.length > 0 && updateRequests.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Keys not found: ${notFound.join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    if (updateRequests.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: "RAW",
          data: updateRequests,
        },
      });
    }

    const updated = entries
      .filter((e) => !notFound.includes(e.key))
      .map((e) => e.key);

    let message = `Successfully updated ${updated.length} string(s): ${updated.join(", ")}`;
    if (notFound.length > 0) {
      message += `\n\nWarning: Keys not found (skipped): ${notFound.join(", ")}`;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: message,
        },
      ],
    };
  }
);

// Tool: delete_strings
server.tool(
  "delete_strings",
  "Delete string entries from the Google Sheet by key",
  {
    keys: z
      .array(z.string())
      .describe("Array of string keys to delete"),
  },
  async ({ keys }) => {
    const sheets = getSheetsClient();
    const data = await getSheetData();
    const features = parseSheet(data);

    // Get spreadsheet to find sheetId
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === SHEET_NAME
    );
    const sheetId = sheet?.properties?.sheetId ?? 0;

    // Build key-to-row map
    const keyRowMap = new Map<string, number>();
    for (const f of features) {
      for (const k of f.keys) {
        keyRowMap.set(k.key, k.row);
      }
    }

    const notFound: string[] = [];
    const rowsToDelete: number[] = [];

    for (const key of keys) {
      const row = keyRowMap.get(key);
      if (row === undefined) {
        notFound.push(key);
      } else {
        rowsToDelete.push(row);
      }
    }

    if (rowsToDelete.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: No keys found to delete: ${notFound.join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    // Delete rows from bottom to top to preserve indices
    rowsToDelete.sort((a, b) => b - a);

    const requests = rowsToDelete.map((row) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS" as const,
          startIndex: row,
          endIndex: row + 1,
        },
      },
    }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });

    const deleted = keys.filter((k) => !notFound.includes(k));
    let message = `Successfully deleted ${deleted.length} string(s): ${deleted.join(", ")}`;
    if (notFound.length > 0) {
      message += `\n\nWarning: Keys not found (skipped): ${notFound.join(", ")}`;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: message,
        },
      ],
    };
  }
);

// --- Start Server ---

async function main() {
  if (!SPREADSHEET_ID) {
    console.error(
      "Error: SPREADSHEET_ID environment variable is required.\n" +
        "Set it to the Google Sheet ID (from the URL: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit)"
    );
    process.exit(1);
  }
  if (!SERVICE_ACCOUNT_JSON_PATH) {
    console.error(
      "Error: SERVICE_ACCOUNT_JSON_PATH environment variable is required.\n" +
        "Set it to the path of your Google service account JSON key file."
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
