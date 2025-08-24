// index.js (Rebuilt with Stable Server-Side Libraries)

import express from 'express';
import cors from 'cors';

// Library for CREATING PDFs from scratch
import PDFDocument from 'pdfkit';

// Library for EDITING (writing to) existing PDFs
import { PDFDocument as PDFLibDocument } from 'pdf-lib';

// Library for READING text content from PDFs (replaces pdf-parse)
import { PdfReader } from 'pdfreader';

const app = express();
// Increase the limit to handle larger base64 PDF strings
app.use(express.json({ limit: '20mb' }));
app.use(cors());

// A helper function to wrap the pdfreader library in a modern async/await Promise
function readPdfTextFromBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const reader = new PdfReader();
    const textItems = [];
    reader.parseBuffer(buffer, (err, item) => {
      if (err) {
        // If there's an error, reject the promise
        reject(err);
      } else if (!item) {
        // If item is null, it's the end of the PDF. Resolve with the joined text.
        resolve(textItems.join(' '));
      } else if (item.text) {
        // If the item has text, add it to our array
        textItems.push(item.text);
      }
    });
  });
}

// === 1. CREATE PDF (Corrected, Robust Version) ===
app.post('/generate-pdf', (req, res) => {
  // We wrap the entire logic in a try...catch to handle any immediate synchronous errors.
  try {
    const { content, filename = 'document.pdf', title, author } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Missing required field: content.' });
    }
    
    const doc = new PDFDocument({ size: 'A4', info: { Title: title, Author: author } });
    const chunks = [];

    // Listen for data chunks
    doc.on('data', (chunk) => chunks.push(chunk));

    // Listen for the end of the stream
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      // Ensure we don't try to send a response if an error has already occurred
      if (!res.headersSent) {
        res.status(200).json({ 
          filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`, 
          base64Data: pdfBuffer.toString('base64') 
        });
      }
    });

    // CRITICAL: Listen for errors on the stream
    doc.on('error', (err) => {
      console.error('CRITICAL: PDF stream generation failed:', err);
      // Ensure we don't try to send a response if one has already been sent
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error during PDF generation.' });
      }
    });

    // Write content to the PDF
    doc.fontSize(12).text(content, { align: 'left' });
    
    // Finalize the PDF. This triggers the 'end' or 'error' event.
    doc.end();

  } catch (error) {
    // This will catch synchronous errors (e.g., if req.body is malformed)
    console.error('Synchronous error in /generate-pdf:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error during PDF generation.' });
    }
  }

// === 2. READ PDF ===
// This endpoint uses pdfreader to extract text from an existing PDF.
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
// This endpoint uses pdf-lib to add text to an existing PDF.
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
    // Y-coordinate in pdf-lib is from the bottom-left, so we subtract from height.
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
  console.log(`PDF Plugin Server [Stable Version] running on port ${PORT}`);
});
