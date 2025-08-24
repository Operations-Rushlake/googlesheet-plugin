// index.js (Final Architecture: Server-Side File Storage for Downloads)

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// PDF Libraries
import PDFDocument from 'pdfkit';                      // For Creating
import { PDFDocument as PDFLibDocument } from 'pdf-lib'; // For Editing
import { PdfReader } from 'pdfreader';                 // For Reading

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());

// --- Setup Temporary File Storage ---
// Render.com and most hosting platforms provide a writable /tmp directory.
const tempDir = path.join(os.tmpdir(), 'pdf-plugin-files');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
console.log(`Temporary file directory set to: ${tempDir}`);


// --- Helper Function for File Cleanup ---
function scheduleFileCleanup(filePath, fileId) {
  // Clean up the file after 5 minutes (300,000 milliseconds)
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err) {
        // It might have already been deleted, so we don't treat "not found" as a critical error.
        if (err.code !== 'ENOENT') {
          console.error(`Error deleting temp file ${fileId}:`, err);
        }
      } else {
        console.log(`Cleaned up temp file: ${fileId}`);
      }
    });
  }, 300000);
}


// === NEW: SERVE FILES FOR DOWNLOAD ===
app.get('/download/:fileId/:filename', (req, res) => {
  try {
    const { fileId, filename } = req.params;
    // Basic sanitization to prevent directory traversal attacks
    if (!/^[a-zA-Z0-9-]+\.pdf$/.test(fileId)) {
      return res.status(400).send('Invalid file ID format.');
    }
    const filePath = path.join(tempDir, fileId);

    res.download(filePath, filename, (err) => {
      if (err) {
        console.error(`Error downloading file ${fileId}:`, err);
        if (!res.headersSent) {
          res.status(404).send('File not found or has expired.');
        }
      }
    });
  } catch (error) {
    console.error('Error in download endpoint:', error);
    res.status(500).send('An internal error occurred.');
  }
});


// === 1. CREATE PDF (Updated to save file and return URL) ===
app.post('/generate-pdf', (req, res) => {
  try {
    const { content, filename = 'document.pdf', title, author } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing required field: content.' });

    const fileId = `${uuidv4()}.pdf`;
    const filePath = path.join(tempDir, fileId);
    
    const options = { size: 'A4' };
    const info = {};
    if (title) info.Title = title;
    if (author) info.Author = author;
    if (Object.keys(info).length > 0) options.info = info;

    const doc = new PDFDocument(options);
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    doc.on('error', (err) => {
      console.error('PDF stream error during creation:', err);
      fs.unlink(filePath, () => {}); // Clean up broken file
      if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed internally.' });
    });

    writeStream.on('finish', () => {
      const downloadUrl = `https://googlesheet-plugin.onrender.com/download/${fileId}/${encodeURIComponent(filename)}`;
      res.status(200).json({ downloadUrl });
      scheduleFileCleanup(filePath, fileId);
    });

    doc.fontSize(12).text(content, { align: 'left' });
    doc.end();
  } catch (error) {
    console.error('Synchronous error in /generate-pdf:', error);
    if (!res.headersSent) res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
});


// === 2. READ PDF (No change needed) ===
function readPdfTextFromBuffer(buffer) {
    return new Promise((resolve, reject) => {
      const reader = new PdfReader();
      const textItems = [];
      reader.parseBuffer(buffer, (err, item) => {
        if (err) reject(err);
        else if (!item) resolve(textItems.join(' '));
        else if (item.text) textItems.push(item.text);
      });
    });
}
app.post('/read-pdf', async (req, res) => {
  try {
    const { base64Data } = req.body;
    if (!base64Data) return res.status(400).json({ error: 'Missing required field: base64Data.' });
    const buffer = Buffer.from(base64Data, 'base64');
    const textContent = await readPdfTextFromBuffer(buffer);
    res.status(200).json({ textContent });
  } catch (error) {
    console.error('Error in /read-pdf:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF reading.' });
  }
});


// === 3. EDIT PDF (Updated to save file and return URL) ===
app.post('/edit-pdf', async (req, res) => {
  try {
    const { base64Data, textToAdd, pageNumber, xPosition, yPosition, filename = 'edited-document.pdf' } = req.body;
    if (!base64Data || !textToAdd || pageNumber === undefined) {
      return res.status(400).json({ error: 'Missing required fields: base64Data, textToAdd, pageNumber.' });
    }
    
    const pdfDoc = await PDFLibDocument.load(Buffer.from(base64Data, 'base64'));
    const pages = pdfDoc.getPages();
    const pageIndex = pageNumber - 1;

    if (pageIndex < 0 || pageIndex >= pages.length) {
      return res.status(400).json({ error: `Invalid page number. Document has ${pages.length} pages.` });
    }
    
    const page = pages[pageIndex];
    const { height } = page.getSize();
    page.drawText(textToAdd, { x: xPosition || 50, y: height - (yPosition || 50), size: 12 });
    
    const modifiedPdfBytes = await pdfDoc.save();
    
    // Save the modified PDF to a temporary file
    const fileId = `${uuidv4()}.pdf`;
    const filePath = path.join(tempDir, fileId);
    fs.writeFileSync(filePath, modifiedPdfBytes);

    const downloadUrl = `https://googlesheet-plugin.onrender.com/download/${fileId}/${encodeURIComponent(filename)}`;
    res.status(200).json({ downloadUrl });
    scheduleFileCleanup(filePath, fileId);

  } catch (error) {
    console.error('Error in /edit-pdf:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF editing.' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF Plugin Server [Direct Download Version] running on port ${PORT}`);
});
