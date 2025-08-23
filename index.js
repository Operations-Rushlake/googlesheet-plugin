// index.js (Corrected Version)
import express from 'express';
import cors from 'cors';
import PDFDocument from 'pdfkit';                      // For Creating (Correct)
import pdf from 'pdf-parse';                           // For Reading (Replaced with a Node.js library)
import { PDFDocument as PDFLibDocument } from 'pdf-lib'; // For Editing (Correct)

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// === 1. CREATE PDF (This code was already correct) ===
app.post('/generate-pdf', (req, res) => {
  try {
    const { content, filename, title, author } = req.body;
    if (!content || !filename) return res.status(400).json({ error: 'Missing content or filename.' });
    
    const doc = new PDFDocument({ size: 'A4', info: { Title: title, Author: author } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.status(200).json({ filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`, base64Data: pdfBuffer.toString('base64') });
    });
    doc.fontSize(12).text(content, { align: 'left' });
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF generation.' });
  }
});

// === 2. READ PDF (Rewritten with pdf-parse) ===
app.post('/read-pdf', async (req, res) => {
  try {
    const { base64Data } = req.body;
    if (!base64Data) return res.status(400).json({ error: 'Missing base64Data.' });
    
    const buffer = Buffer.from(base64Data, 'base64');
    const data = await pdf(buffer);
    
    res.status(200).json({ 
      textContent: data.text, 
      numPages: data.numpages,
      info: data.info // pdf-parse can also extract metadata
    });
  } catch (error) {
    console.error('Error reading PDF:', error);
    res.status(500).json({ error: 'Internal Server Error during PDF reading.' });
  }
});

// === 3. WRITE (EDIT) PDF (This code was already correct) ===
app.post('/edit-pdf', async (req, res) => {
  try {
    const { base64Data, textToAdd, pageNumber, xPosition, yPosition } = req.body;
    if (!base64Data || !textToAdd || pageNumber === undefined) return res.status(400).json({ error: 'Missing required fields.' });
    
    const pdfDoc = await PDFLibDocument.load(Buffer.from(base64Data, 'base64'));
    const pages = pdfDoc.getPages();
    const pageIndex = pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) return res.status(400).json({ error: `Invalid page number.` });
    
    const page = pages[pageIndex];
    const { height } = page.getSize();
    page.drawText(textToAdd, { x: xPosition || 50, y: height - (yPosition || 50), size: 12 });
    
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
