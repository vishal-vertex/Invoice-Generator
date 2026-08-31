# Tax Invoice Generator

A professional React + Express tax invoice generator with a question-based form interface and proper `frontend/` and `backend/` folder structure.

## Features
- Landing page with a `Generate Invoice` button
- Question-based dashboard with bold question labels asking for invoice details
- Company information (name, address, GST number, logo)
- Invoice information (number, date)
- Customer information (bill to, attention)
- Service details (description, work scope)
- Line items with amounts (no quantity/unit price)
- Amount in words, bank details, and declaration fields
- Saves drafts to backend JSON storage
- Loads saved invoices anytime
- Generates professional TAX INVOICE format as PDF

## Project structure
- `frontend/` — React app and Vite config
- `backend/` — Express API server and saved data storage

## Setup
1. Open the project root in a terminal.
2. Run `npm run install:all`.
3. Start the backend:
   - `npm run dev:backend`
4. Start the frontend:
   - `npm run dev:frontend`

## Production
1. Build the frontend: `npm run build:frontend`
2. Serve the built frontend from the backend by running: `npm run dev:backend`

## Form Structure
The dashboard presents invoice creation as a series of questions:
- **Company Information** – Company name, address, GST, logo
- **Invoice Information** – Invoice number, date
- **Customer Information** – Bill to, attention person
- **Service Details** – Service description, work scope
- **Line Items** – Add charges with amounts (e.g., Service Charges, SGST @ 9%)
- **Amount in Words** – Invoice total written in words
- **Bank Details** – Bank name, account, IFSC, branch

## Notes
- Backend data is stored in `backend/data/invoices.json`.
- Frontend uses file upload for company logo images.
- PDF output follows the TAX INVOICE format with proper sections.
