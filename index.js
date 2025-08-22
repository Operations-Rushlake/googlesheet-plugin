// index.js (Final Multi-Function Version)
import express from 'express';
import cors from 'cors';
import PDFDocument from 'pdfkit'; // For Creating
import pdf from 'pdf-parse';      // For Reading
import { PDFDocument as PDFLibDocument } from 'pdf-lib'; // For Editing

const app = express();
app.use(express.json({ limit: '10mb' })); // Increased limit for file uploads
app.use(cors());

// === 1. CREATE PDF ===
app.post('/generate-pdf', (req, res) => {
  try {
    const { content, filename, title, author } = req.body;
    if (!content || !filename) {
      return res.status(400).json({ error: 'Missing required fields: content and filename.' });
    }
    const doc = new PDFDocument({ size: 'A4', info: { Title: title, Author: author } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.status(200).json({ filename, base64Data: pdfBuffer.toString('base64') });
    });
    doc.fontSize(12).text(content, { align: 'left' });
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF generation.' });
  }
});

// === 2. READ PDF ===
app.post('/read-pdf', async (req, res) => {
  try {
    const { base64Data } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: 'Missing required field: base64Data.' });
    }
    const buffer = Buffer.from(base64Data, 'base64');
    const data = await pdf(buffer);
    res.status(200).json({ textContent: data.text, numPages: data.numpages });
  } catch (error) {
    console.error('Error reading PDF:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF reading.' });
  }
});

// === 3. WRITE (EDIT) PDF ===
app.post('/edit-pdf', async (req, res) => {
  try {
    const { base64Data, textToAdd, pageNumber, xPosition, yPosition } = req.body;
    if (!base64Data || !textToAdd || !pageNumber) {
      return res.status(400).json({ error: 'Missing required fields: base64Data, textToAdd, and pageNumber.' });
    }
    const pdfBuffer = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFLibDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const pageIndex = pageNumber - 1; // Convert from 1-based to 0-based index

    if (pageIndex < 0 || pageIndex >= pages.length) {
      return res.status(400).json({ error: `Invalid page number. Document has ${pages.length} pages.` });
    }
    const page = pages[pageIndex];
    
    // Y-coordinate in pdf-lib is from the bottom of the page, so we adjust
    const { height } = page.getSize();
    const finalY = height - (yPosition || 50); // Default to 50 from top if not provided

    page.drawText(textToAdd, { x: xPosition || 50, y: finalY, size: 12 });
    
    const modifiedPdfBytes = await pdfDoc.save();
    res.status(200).json({ base64Data: Buffer.from(modifiedPdfBytes).toString('base64') });
  } catch (error) {
    console.error('Error editing PDF:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF editing.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Multi-function PDF server running on port ${PORT}`);
});

