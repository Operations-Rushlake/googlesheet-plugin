// index.js (ES Module Syntax)
import express from 'express';
import PDFDocument from 'pdfkit';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors());

// Serve the ai-plugin.json from the standard .well-known directory
app.use('/.well-known', express.static(join(__dirname, '.well-known')));

// Serve the openapi.yaml from a public directory
app.use(express.static(join(__dirname, 'public')));


// The API endpoint that generates the PDF
app.post('/generate-pdf', (req, res) => {
  try {
    const { content, filename, title, author } = req.body;

    if (!content || !filename) {
      return res.status(400).json({ error: 'Missing required fields: content and filename.' });
    }

    const doc = new PDFDocument({
      size: 'A4',
      info: {
        Title: title || 'Generated Document',
        Author: author || 'PDF Generator Plugin',
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const base64Data = pdfBuffer.toString('base64');
      
      res.status(200).json({
        filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
        base64Data: base64Data,
        message: 'PDF generated successfully.'
      });
    });

    doc.fontSize(12).text(content, 100, 100, {
      align: 'left',
    });

    doc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Internal Server Error while generating PDF.' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF Generator plugin server running on port ${PORT}`);
});

