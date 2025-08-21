import express from "express";
import { google } from "googleapis";
import cors from "cors";
import path from 'path'; // <-- ADD: Import the 'path' module
import { fileURLToPath } from 'url'; // <-- ADD: Import for ES modules __dirname equivalent

const app = express();

// --- START: NEW STATIC FILE SERVING CONFIGURATION ---
// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Instruct Express to serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// --- END: NEW STATIC FILE SERVING CONFIGURATION ---

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
    access_type: "offline",   // ensures refresh_token
    scope: SCOPES,
    prompt: "consent",        // force to return refresh_token at least once
  });
  res.json({ url });
});

// Step 2: OAuth callback
app.get("/auth/callback", async (req, res) => {
  const { code, user } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);

    // If refresh_token is missing, keep the old one
    if (!tokens.refresh_token && userTokens[user || "default"]) {
      tokens.refresh_token = userTokens[user || "default"].refresh_token;
    }

    // Save per user
    userTokens[user || "default"] = tokens;

    res.send("✅ Authentication successful! You can now return to TypingMind.");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// Helper: Ensure access token is fresh
async function ensureFreshToken(user) {
  const tokens = userTokens[user];
  if (!tokens) throw new Error("User not authenticated");

  oauth2Client.setCredentials(tokens);

  const newToken = await oauth2Client.getAccessToken();
  if (newToken.token) {
    userTokens[user].access_token = newToken.token;
  }
  return oauth2Client;
}

// Step 3: List spreadsheets in Drive
app.get("/drive/files", async (req, res) => {
  const user = req.query.user || "default";
  if (!userTokens[user]) return res.status(401).json({ error: "User not authenticated" });

  try {
    const client = await ensureFreshToken(user);
    const drive = google.drive({ version: "v3", auth: client });
    const result = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: "files(id, name)",
    });
    res.json(result.data.files);
  } catch (err) {
    console.error("Drive error:", err);
    res.status(500).json({ error: "Failed to list files" });
  }
});

// Step 4: Read from a sheet
app.post("/sheets/read", async (req, res) => {
  const { user, fileId, range } = req.body;
  if (!userTokens[user || "default"]) return res.status(401).json({ error: "User not authenticated" });

  try {
    const client = await ensureFreshToken(user || "default");
    const sheets = google.sheets({ version: "v4", auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range,
    });
    res.json(response.data);
  } catch (err) {
    console.error("Sheets read error:", err);
    res.status(500).json({ error: "Failed to read sheet" });
  }
});

// Step 5: Write to a sheet
app.post("/sheets/write", async (req, res) => {
  const { user, fileId, range, values } = req.body;
  if (!userTokens[user || "default"]) return res.status(401).json({ error: "User not authenticated" });

  try {
    const client = await ensureFreshToken(user || "default");
    const sheets = google.sheets({ version: "v4", auth: client });
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: fileId,
      range,
      valueInputOption: "RAW",
      requestBody: { values },
    });
    res.json(response.data);
  } catch (err) {
    console.error("Sheets write error:", err);
    res.status(500).json({ error: "Failed to write sheet" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
