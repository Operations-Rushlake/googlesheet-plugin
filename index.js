import express from "express";
import { google } from "googleapis";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Load env vars directly from Render
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
