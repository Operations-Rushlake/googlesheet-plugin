import express from "express";
import { google } from "googleapis";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets"
];

// Step 1: Get auth URL
app.get("/auth/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  res.json({ url });
});

// Step 2: Handle OAuth callback
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  res.json({ message: "Authentication successful", tokens });
});

// Step 3: List Google Sheets in Drive
app.get("/drive/files", async (req, res) => {
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const result = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: "files(id, name)",
  });
  res.json(result.data.files);
});

// Step 4: Read from a sheet
app.post("/sheets/read", async (req, res) => {
  const { fileId, range } = req.body;
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: fileId,
    range,
  });
  res.json(response.data);
});

// Step 5: Write to a sheet
app.post("/sheets/write", async (req, res) => {
  const { fileId, range, values } = req.body;
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId: fileId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
  res.json(response.data);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));

