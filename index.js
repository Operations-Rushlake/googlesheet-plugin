import express from "express";
import { google } from "googleapis";
import session from "express-session";

const app = express();

// session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));

// configure OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// step 1: auth route
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  res.redirect(url);
});

// step 2: callback route
app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  req.session.tokens = tokens;
  res.send("Authentication successful! You can now use the plugin.");
});

// example: write to a sheet
app.post("/write", async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    await sheets.spreadsheets.values.update({
      spreadsheetId: "your_spreadsheet_id_here", // <- can be dynamic later
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["Name", "Age", "City"]],
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// run server
app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
