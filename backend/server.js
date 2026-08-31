import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import bodyParser from 'body-parser';
import { generatePdfBuffer } from './pdfGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 4000;

// Enable CORS and increase body limit for base64 letterhead images
app.use(cors());
app.use(bodyParser.json({ limit: '15mb' }));

// Serve built frontend assets if dist exists
app.use(express.static(path.join(__dirname, '../frontend/dist')));

/**
 * Primary Stateless API Endpoint: Generate PDF Document
 * Accepts letterhead data URL and form details, calculates boundaries,
 * and streams back the generated PDF binary.
 */
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const payload = req.body || {};
    const pdfBuffer = await generatePdfBuffer(payload);

    const docType = (payload.documentType || 'document').toLowerCase();
    const docNo = (payload.documentNo || 'draft').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${docType}_${docNo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate PDF document. ' + error.message });
  }
});

// Fallback for SPA routing in production
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Stateless Invoice/Quotation Backend running on http://localhost:${port}`);
});
