// index.js (Final, Corrected, and Robust Version)

import express from 'express';
import cors from 'cors';
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { PdfReader } from 'pdfreader';

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());

function readPdfTextFromBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const reader = new PdfReader();
    const textItems = [];
    reader.parseBuffer(buffer, (err, item) => {
      if (err) {
        reject(err);
      } else if (!item) {
        resolve(textItems.join(' '));
      } else if (item.text) {
        textItems.push(item.text);
      }
    });
  });
}

// === 1. CREATE PDF (FINAL, ROBUST VERSION) ===
app.post('/generate-pdf', (req, res) => {
  try {
    const { content, filename = 'document.pdf', title, author } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Missing required field: content.' });
    }

    // *** FIX FOR THE 500 ERROR ***
    // We build the options object safely, only including metadata if it exists.
    // This prevents passing 'undefined' to pdfkit.
    const options = { size: 'A4' };
    const info = {};
    if (title) info.Title = title;
    if (author) info.Author = author;
    if (Object.keys(info).length > 0) {
      options.info = info;
    }
    
    const doc = new PDFDocument(options);
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    doc.on('end', () => {
      if (!res.headersSent) {
        const pdfBuffer = Buffer.concat(chunks);
        res.status(200).json({
          filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
          base64Data: pdfBuffer.toString('base64'),
        });
      }
    });

    doc.on('error', (err) => {
      console.error('CRITICAL: PDF stream generation failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error during PDF generation.' });
      }
    });

    doc.fontSize(12).text(content, { align: 'left' });
    doc.end();

  } catch (error) {
    console.error('Synchronous error in /generate-pdf:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error during PDF generation.' });
    }
  }
}); // <-- FIX FOR SYNTAX ERROR: This closing parenthesis/bracket was likely missing.

// === 2. READ PDF ===
app.post('/read-pdf', async (req, res) => {
  try {
    const { base64Data } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: 'Missing required field: base64Data.' });
    }
    const buffer = Buffer.from(base64Data, 'base64');
    const textContent = await readPdfTextFromBuffer(buffer);
    res.status(200).json({ textContent });
  } catch (error) {
    console.error('Error in /read-pdf:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF reading.' });
  }
});

// === 3. WRITE (EDIT) PDF ===
app.post('/edit-pdf', async (req, res) => {
  try {
    const { base64Data, textToAdd, pageNumber, xPosition, yPosition } = req.body;
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
    res.status(200).json({ base64Data: Buffer.from(modifiedPdfBytes).toString('base64') });
  } catch (error) {
    console.error('Error in /edit-pdf:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF editing.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF Plugin Server [Final Version] running on port ${PORT}`);
});
