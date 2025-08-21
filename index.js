import express from "express";
import { google } from "googleapis";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Load env vars from Render
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets"
];

// Temporary in-memory storage (replace with DB later)
const userTokens = {};

// ------------------ AUTH ------------------

// Step 1: Get auth URL
app.get("/auth/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  res.json({ url });
});

// Step 2: OAuth callback
app.get("/auth/callback", async (req, res) => {
  const { code, user } = req.query; // pass ?user=someId when redirecting
  const { tokens } = await oauth2Client.getToken(code);

  userTokens[user || "default"] = tokens; // Save per user

  res.json({ message: "Authentication successful. You can now use the plugin." });
});

// ------------------ DRIVE ------------------

// Step 3: List spreadsheets in Drive
app.get("/drive/files", async (req, res) => {
  const user = req.query.user || "default";
  if (!userTokens[user]) return res.status(401).json({ error: "User not authenticated" });

  oauth2Client.setCredentials(userTokens[user]);

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const result = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: "files(id, name)",
  });

  res.json(result.data.files);
});

// ------------------ SHEETS ------------------

// Step 4: Read from a sheet
app.post("/sheets/read", async (req, res) => {
  const { user, fileId, range } = req.body;
  if (!userTokens[user || "default"]) return res.status(401).json({ error: "User not authenticated" });

  oauth2Client.setCredentials(userTokens[user || "default"]);

  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: fileId,
    range,
  });

  res.json(response.data);
});

// Step 5: Write to a sheet
app.post("/sheets/write", async (req, res) => {
  const { user, fileId, range, values } = req.body;
  if (!userTokens[user || "default"]) return res.status(401).json({ error: "User not authenticated" });

  oauth2Client.setCredentials(userTokens[user || "default"]);

  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId: fileId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  res.json(response.data);
});

// ------------------ PLUGIN & OPENAPI ------------------

app.get("/plugin.json", (req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "Google Sheets Plugin",
    name_for_model: "gsheets_plugin",
    description_for_human: "Read, write, and manage your Google Sheets directly from TypingMind.",
    description_for_model: "Plugin for interacting with Google Sheets via Google Drive and Sheets API. Supports authentication, listing spreadsheet files, reading cell ranges, and writing values.",
    auth: { type: "none" },
    api: {
      type: "openapi",
      url: "https://googlesheet-plugin.onrender.com/openapi.yaml"
    },
    logo_url: "https://www.gstatic.com/images/branding/product/1x/sheets_48dp.png",
    contact_email: "support@example.com",
    legal_info_url: "https://example.com/legal"
  });
});

app.get("/openapi.yaml", (req, res) => {
  const yaml = `
openapi: 3.0.1
info:
  title: Google Sheets Plugin API
  description: API for reading/writing Google Sheets through TypingMind plugin.
  version: 1.0.0
servers:
  - url: https://googlesheet-plugin.onrender.com
paths:
  /auth/url:
    get:
      summary: Get Google OAuth2 URL
      responses:
        '200':
          description: Auth URL returned
  /auth/callback:
    get:
      summary: Handle OAuth2 callback
      parameters:
        - name: code
          in: query
          required: true
          schema: { type: string }
        - name: user
          in: query
          required: false
          schema: { type: string }
      responses:
        '200':
          description: Authentication successful
  /drive/files:
    get:
      summary: List spreadsheets in Google Drive
      parameters:
        - name: user
          in: query
          required: false
          schema: { type: string }
      responses:
        '200':
          description: List of spreadsheets
  /sheets/read:
    post:
      summary: Read values from a sheet
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                user: { type: string }
                fileId: { type: string }
                range: { type: string }
      responses:
        '200':
          description: Values read from the sheet
  /sheets/write:
    post:
      summary: Write values to a sheet
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                user: { type: string }
                fileId: { type: string }
                range: { type: string }
                values:
                  type: array
                  items:
                    type: array
                    items: { type: string }
      responses:
        '200':
          description: Write operation result
  `;
  res.type("text/yaml").send(yaml);
});

// ------------------ SERVER ------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
