// index.js (Final Version with File Extension Fix)

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// PDF Libraries
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { PdfReader } from 'pdfreader';

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());

const tempDir = path.join(os.tmpdir(), 'pdf-plugin-files');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
console.log(`Temporary file directory set to: ${tempDir}`);

function scheduleFileCleanup(filePath, fileId) {
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err) {
        if (err.code !== 'ENOENT') {
          console.error(`Error deleting temp file ${fileId}:`, err);
        }
      } else {
        console.log(`Cleaned up temp file: ${fileId}`);
      }
    });
  }, 300000); // 5 minutes
}

app.get('/download/:fileId/:filename', (req, res) => {
  try {
    const { fileId, filename } = req.params;
    if (!/^[a-zA-Z0-9-]+\.pdf$/.test(fileId)) {
      return res.status(400).send('Invalid file ID format.');
    }
    const filePath = path.join(tempDir, fileId);
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error(`Error serving download for ${fileId}:`, err);
        if (!res.headersSent) {
          res.status(404).send('File not found or has expired.');
        }
      }
    });
  } catch (error) {
    console.error('Critical error in download endpoint:', error);
    res.status(500).send('An internal error occurred.');
  }
});

// === 1. CREATE PDF ===
app.post('/generate-pdf', (req, res) => {
  try {
    const { content, filename = 'document.pdf', title, author } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing required field: content.' });

    const options = { size: 'A4' };
    const info = {};
    if (title) info.Title = title;
    if (author) info.Author = author;
    if (Object.keys(info).length > 0) options.info = info;

    const doc = new PDFDocument(options);
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const fileId = `${uuidv4()}.pdf`;
      const filePath = path.join(tempDir, fileId);

      fs.writeFileSync(filePath, pdfBuffer);

      // *** FIX *** Ensure the filename has a .pdf extension
      const finalFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
      const downloadUrl = `https://googlesheet-plugin.onrender.com/download/${fileId}/${encodeURIComponent(finalFilename)}`;
      
      res.status(200).json({ downloadUrl });
      scheduleFileCleanup(filePath, fileId);
    });

    doc.on('error', (err) => {
      console.error('PDF generation error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed internally.' });
    });

    doc.fontSize(12).text(content, { align: 'left' });
    doc.end();
  } catch (error) {
    console.error('Synchronous error in /generate-pdf:', error);
    if (!res.headersSent) res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
});

// === 2. READ PDF ===
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

// === 3. EDIT PDF ===
app.post('/edit-pdf', async (req, res) => {
  try {
    const { base64Data, textToAdd, pageNumber, xPosition, yPosition, filename = 'edited-document.pdf' } = req.body;
    if (!base64Data || !textToAdd || pageNumber === undefined) {
      return res.status(400).json({ error: 'Missing required fields.' });
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
    
    const fileId = `${uuidv4()}.pdf`;
    const filePath = path.join(tempDir, fileId);
    fs.writeFileSync(filePath, modifiedPdfBytes);

    // *** FIX *** Ensure the filename has a .pdf extension
    const finalFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
    const downloadUrl = `https://googlesheet-plugin.onrender.com/download/${fileId}/${encodeURIComponent(finalFilename)}`;

    res.status(200).json({ downloadUrl });
    scheduleFileCleanup(filePath, fileId);
  } catch (error) {
    console.error('Error in /edit-pdf:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF editing.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF Plugin Server [Final Version] running on port ${PORT}`);
});
