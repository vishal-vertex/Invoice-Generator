import { useState, useMemo, useEffect } from 'react';
import { generateClientPdf, generatePdfBlobUrl } from './pdfGenerator';

const BACKEND_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://invoice-generator-o87g.onrender.com').replace(/\/+$/, '');

const defaultItem = () => ({
  name: '',
  description: '',
  qty: 1,
  unitPrice: 0,
  taxPercent: 0,
  discountPercent: 0,
});

const getTodayDate = () => new Date().toISOString().slice(0, 10);
const getFutureDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function App() {
  const [step, setStep] = useState(1); // 1: Select Type, 2: Upload, 3: Fill Details, 4: Preview & Download
  const [documentType, setDocumentType] = useState('quotation'); // 'quotation' | 'invoice'
  const [pageSize, setPageSize] = useState('a4'); // 'a4' | 'letter'
  const [currency, setCurrency] = useState('₹');

  // Letterhead State
  const [letterheadData, setLetterheadData] = useState(null);
  const [letterheadFileName, setLetterheadFileName] = useState('');

  // Form Fields
  const [documentNo, setDocumentNo] = useState('QT-2026-001');
  const [documentDate, setDocumentDate] = useState(getTodayDate());
  const [validUntil, setValidUntil] = useState(getFutureDate(30));
  const [dueDate, setDueDate] = useState(getFutureDate(15));
  const [referenceNo, setReferenceNo] = useState('');

  const [company, setCompany] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    gstNo: '',
  });

  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
  });

  const [items, setItems] = useState([
    { name: 'Web Development Services', description: 'Custom website redesign and implementation', qty: 1, unitPrice: 15000, taxPercent: 18, discountPercent: 0 },
  ]);

  const [notes, setNotes] = useState('Thank you for doing business with us!');
  const [terms, setTerms] = useState('Payment is required within 15 days of invoice date.');

  const [paymentInfo, setPaymentInfo] = useState({
    bankName: 'HDFC Bank',
    accountNo: '50100012345678',
    ifsc: 'HDFC0001234',
    upiId: 'company@upi',
  });

  // UI States
  const [showGuidelines, setShowGuidelines] = useState(true);
  const [previewMode, setPreviewMode] = useState('layout'); // 'layout' | 'pdf'
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [isGeneratingBlob, setIsGeneratingBlob] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [previewPage, setPreviewPage] = useState(0);

  // Generate live PDF object URL when in 'pdf' preview mode
  useEffect(() => {
    let activeUrl = '';
    let isCancelled = false;

    if (step === 4 && previewMode === 'pdf') {
      setIsGeneratingBlob(true);
      const payload = {
        documentType,
        pageSize,
        currency,
        letterheadData,
        documentNo,
        documentDate,
        dueDate,
        validUntil,
        referenceNo,
        customer,
        company,
        items,
        notes,
        terms,
        paymentInfo,
      };

      generatePdfBlobUrl(payload)
        .then((url) => {
          if (!isCancelled) {
            activeUrl = url;
            setPdfPreviewUrl(url);
          } else {
            URL.revokeObjectURL(url);
          }
        })
        .catch((err) => console.error('Error generating PDF blob URL:', err))
        .finally(() => {
          if (!isCancelled) setIsGeneratingBlob(false);
        });
    }

    return () => {
      isCancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [step, previewMode, documentType, pageSize, currency, letterheadData, documentNo, documentDate, dueDate, validUntil, referenceNo, customer, company, items, notes, terms, paymentInfo]);

  // Server wake-up & health status: 'checking' | 'waking' | 'online'
  const [serverStatus, setServerStatus] = useState('checking');

  // Automatic Background Wake-Up on site launch & Periodic Keep-Alive
  useEffect(() => {
    let isMounted = true;

    const wakeUpBackend = async () => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
        });
        if (res.ok) {
          if (isMounted) setServerStatus('online');
          return;
        }
      } catch {
        // Cold starting or unreachable
      }

      if (isMounted) setServerStatus('waking');

      // Poll periodically until online
      const pollTimer = setInterval(async () => {
        try {
          const res = await fetch(`${BACKEND_BASE_URL}/api/health`, {
            method: 'GET',
            signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
          });
          if (res.ok) {
            if (isMounted) setServerStatus('online');
            clearInterval(pollTimer);
          }
        } catch {
          // Still spinning up
        }
      }, 6000);

      return () => clearInterval(pollTimer);
    };

    wakeUpBackend();

    // Heartbeat every 4 minutes to prevent Render free instance from idling out
    const heartbeat = setInterval(() => {
      fetch(`${BACKEND_BASE_URL}/api/health`, { method: 'GET' }).catch(() => {});
    }, 4 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(heartbeat);
    };
  }, []);

  // Switch Document Type
  const handleTypeSelect = (type) => {
    setDocumentType(type);
    if (type === 'quotation') {
      if (documentNo.startsWith('INV-')) setDocumentNo(documentNo.replace('INV-', 'QT-'));
      if (!documentNo) setDocumentNo('QT-2026-001');
    } else {
      if (documentNo.startsWith('QT-')) setDocumentNo(documentNo.replace('QT-', 'INV-'));
      if (!documentNo) setDocumentNo('INV-2026-001');
    }
  };

  // Letterhead Upload & Validation
  const handleLetterheadUpload = (file) => {
    if (!file) return;
    setErrorMessage('');

    // Valid file types
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('Invalid file format. Please upload a PNG, JPG, WEBP, or SVG image.');
      return;
    }

    // Size limit: 10MB
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File size exceeds 10MB. Please upload a smaller image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setLetterheadData(e.target.result);
      setLetterheadFileName(file.name);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read uploaded letterhead file.');
    };
    reader.readAsDataURL(file);
  };

  // Item Handlers
  const handleAddItem = () => {
    setItems([...items, defaultItem()]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    let numVal = value;
    if (['qty', 'unitPrice', 'taxPercent', 'discountPercent'].includes(field)) {
      numVal = value === '' ? 0 : Math.max(0, parseFloat(value) || 0);
    }
    updated[index] = { ...updated[index], [field]: numVal };
    setItems(updated);
  };

  // Dynamic Financial Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    const computedItems = items.map((item) => {
      const qty = Math.max(0, Number(item.qty) || 0);
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      const taxPercent = Math.max(0, Number(item.taxPercent) || 0);
      const discountPercent = Math.max(0, Number(item.discountPercent) || 0);

      const base = qty * unitPrice;
      const tax = (base * taxPercent) / 100;
      const disc = (base * discountPercent) / 100;
      const lineTotal = base + tax - disc;

      subtotal += base;
      totalTax += tax;
      totalDiscount += disc;

      return { ...item, lineTotal };
    });

    const grandTotal = subtotal + totalTax - totalDiscount;

    return { computedItems, subtotal, totalTax, totalDiscount, grandTotal };
  }, [items]);

  // Split Items across preview pages (approx 6 items per page)
  const previewPages = useMemo(() => {
    const pageSizeItems = 6;
    const pages = [];
    for (let i = 0; i < calculations.computedItems.length; i += pageSizeItems) {
      pages.push(calculations.computedItems.slice(i, i + pageSizeItems));
    }
    return pages.length > 0 ? pages : [[]];
  }, [calculations.computedItems]);

  // Request PDF Generation:
  // Tries Render backend API with a 12-second timeout.
  // If the backend is waking up or slow or fails, seamlessly falls back to instant client-side generation.
  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    setErrorMessage('');
    setSuccessNotice('');

    const payload = {
      documentType,
      pageSize,
      currency,
      letterheadData,
      documentNo,
      documentDate,
      dueDate,
      validUntil,
      referenceNo,
      customer,
      company,
      items,
      notes,
      terms,
      paymentInfo,
    };

    const sanitizedDocNo = (documentNo || 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${documentType}_${sanitizedDocNo}.pdf`;

    // 1. Try Backend API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(`${BACKEND_BASE_URL}/api/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setServerStatus('online');
        setSuccessNotice('PDF generated & downloaded via Render backend!');
        setTimeout(() => setSuccessNotice(''), 4000);
        setIsGeneratingPdf(false);
        return;
      }
    } catch (apiErr) {
      console.warn('Backend API request timed out or was unavailable, using client-side engine:', apiErr);
    }

    // 2. Client-side fallback engine (100% reliable)
    try {
      await generateClientPdf(payload);
      setSuccessNotice('PDF generated & downloaded instantly!');
      setTimeout(() => setSuccessNotice(''), 4000);
    } catch (clientErr) {
      console.error('PDF Generation failed:', clientErr);
      setErrorMessage('Could not generate PDF: ' + clientErr.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const isQuotation = documentType === 'quotation';

  return (
    <div className="app-container">
      {/* Brand Header */}
      <header className="app-header">
        <div className="brand-badge">
          <div className="brand-icon">☣</div>
          <div className="brand-title">
            <h1>Company Engine</h1>
            <p>Letterhead Quotation & Invoice Engine</p>
          </div>
        </div>

        <div className="header-actions">
          <div
            className={`server-status-pill ${serverStatus}`}
            title={
              serverStatus === 'online'
                ? 'Render backend server is active and connected'
                : 'Render free tier backend is spinning up in the background. PDFs generate instantly client-side in the meantime!'
            }
          >
            <span className="status-dot"></span>
            {serverStatus === 'online'
              ? '⚡ Backend Online'
              : serverStatus === 'waking'
              ? '⏳ Waking Up Backend...'
              : '🔍 Connecting Backend...'}
          </div>

          <div className={`document-badge ${documentType}`}>
            {isQuotation ? '📋 Quotation Mode' : '🧾 Invoice Mode'}
          </div>
        </div>
      </header>

      {/* Step Wizard Bar */}
      <nav className="wizard-steps">
        <div className={`wizard-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`} onClick={() => setStep(1)}>
          <div className="step-num">1</div>
          <span>Select Document</span>
        </div>
        <div className={`wizard-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`} onClick={() => setStep(2)}>
          <div className="step-num">2</div>
          <span>Upload Letterhead</span>
        </div>
        <div className={`wizard-step ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`} onClick={() => setStep(3)}>
          <div className="step-num">3</div>
          <span>Fill Details</span>
        </div>
        <div className={`wizard-step ${step === 4 ? 'active' : ''}`} onClick={() => setStep(4)}>
          <div className="step-num">4</div>
          <span>Preview & PDF</span>
        </div>
      </nav>

      {errorMessage && <div className="error-banner">{errorMessage}</div>}
      {successNotice && (
        <div
          className="success-banner"
          style={{
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            padding: '12px 18px',
            borderRadius: '10px',
            marginBottom: '20px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>✅</span>
          <span>{successNotice}</span>
        </div>
      )}

      {/* Main Grid Workspace */}
      <div className={`workspace-grid ${step === 4 ? 'has-preview' : ''}`}>
        <div className="form-column">
          {/* STEP 1: Select Document Type */}
          {step === 1 && (
            <div className="card-panel">
              <div className="card-title">
                <span>Step 1: Choose Document Type</span>
              </div>
              <p className="card-subtitle">Select whether you want to issue a Quotation or an Invoice.</p>

              <div className="type-selection-grid">
                <div
                  className={`type-card ${documentType === 'quotation' ? 'selected' : ''}`}
                  onClick={() => handleTypeSelect('quotation')}
                >
                  <h3>📋 Quotation</h3>
                  <p>Send a price quote with valid date, estimate lines, and terms to prospective clients.</p>
                </div>

                <div
                  className={`type-card ${documentType === 'invoice' ? 'selected' : ''}`}
                  onClick={() => handleTypeSelect('invoice')}
                >
                  <h3>🧾 Invoice</h3>
                  <p>Issue an official bill with due date, tax breakdown, and payment bank/UPI instructions.</p>
                </div>
              </div>

              <div className="action-bar">
                <div></div>
                <button className="btn-primary" onClick={() => setStep(2)}>
                  Continue to Letterhead →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Upload Letterhead */}
          {step === 2 && (
            <div className="card-panel">
              <div className="card-title">
                <span>Step 2: Upload Letterhead</span>
                <span className="card-subtitle">PNG, JPG, WEBP, SVG (Max 10MB)</span>
              </div>

              <div
                className="upload-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleLetterheadUpload(e.dataTransfer.files[0]);
                }}
                onClick={() => document.getElementById('letterhead-file-input').click()}
              >
                <div className="upload-icon">📁</div>
                <h4>Drag & Drop your letterhead image here</h4>
                <p>or click to browse from your device</p>
                <input
                  id="letterhead-file-input"
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files?.[0] && handleLetterheadUpload(e.target.files[0])}
                />
              </div>

              {letterheadData && (
                <div className="letterhead-preview-strip">
                  <img src={letterheadData} alt="Uploaded Letterhead" className="letterhead-thumb" />
                  <div>
                    <strong>{letterheadFileName || 'Custom Letterhead Uploaded'}</strong>
                    <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                      Letterhead preserved 100% untouched. Generated text will render strictly within Middle 65%.
                    </p>
                  </div>
                </div>
              )}

              <div className="action-bar">
                <button className="btn-secondary" onClick={() => setStep(1)}>
                  ← Back
                </button>
                <button className="btn-primary" onClick={() => setStep(3)}>
                  Fill Document Details →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Fill Details */}
          {step === 3 && (
            <div>
              {/* Document Info Card */}
              <div className="card-panel">
                <div className="card-title">
                  <span>Document Details</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--slate-500)' }}>
                    {isQuotation ? 'Quotation Metadata' : 'Invoice Metadata'}
                  </span>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>{isQuotation ? 'Quotation Number' : 'Invoice Number'}</label>
                    <input
                      className="form-control"
                      value={documentNo}
                      onChange={(e) => setDocumentNo(e.target.value)}
                      placeholder={isQuotation ? 'QT-2026-001' : 'INV-2026-001'}
                    />
                  </div>

                  <div className="form-group">
                    <label>{isQuotation ? 'Quotation Date' : 'Invoice Date'}</label>
                    <input
                      type="date"
                      className="form-control"
                      value={documentDate}
                      onChange={(e) => setDocumentDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>{isQuotation ? 'Valid Until' : 'Due Date'}</label>
                    <input
                      type="date"
                      className="form-control"
                      value={isQuotation ? validUntil : dueDate}
                      onChange={(e) => (isQuotation ? setValidUntil(e.target.value) : setDueDate(e.target.value))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Reference No. / PO No.</label>
                    <input
                      className="form-control"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      placeholder="PO-88492"
                    />
                  </div>

                  <div className="form-group">
                    <label>Currency Symbol</label>
                    <input
                      className="form-control"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      placeholder="₹, $, €, £"
                    />
                  </div>
                </div>
              </div>

              {/* Customer Details Card */}
              <div className="card-panel">
                <div className="card-title">
                  <span>Customer Details</span>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Customer / Client Name</label>
                    <input
                      className="form-control"
                      value={customer.name}
                      onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                      placeholder="Acme Corporation Ltd"
                    />
                  </div>

                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      className="form-control"
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      className="form-control"
                      value={customer.email}
                      onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                      placeholder="billing@acme.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>Billing Address</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={customer.address}
                      onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                      placeholder="123 Tech Park, Suite 400..."
                    />
                  </div>
                </div>
              </div>

              {/* Supplier / Company Details (Optional override if letterhead lacks text) */}
              <div className="card-panel">
                <div className="card-title">
                  <span>Company / Supplier Details (Optional)</span>
                  <span className="card-subtitle">Included if not already inside your letterhead</span>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Company Name</label>
                    <input
                      className="form-control"
                      value={company.name}
                      onChange={(e) => setCompany({ ...company, name: e.target.value })}
                      placeholder="My Business Solutions"
                    />
                  </div>

                  <div className="form-group">
                    <label>Tax ID / GSTIN</label>
                    <input
                      className="form-control"
                      value={company.gstNo}
                      onChange={(e) => setCompany({ ...company, gstNo: e.target.value })}
                      placeholder="27AAACG1234H1Z5"
                    />
                  </div>

                  <div className="form-group">
                    <label>Contact Phone / Email</label>
                    <input
                      className="form-control"
                      value={company.phone}
                      onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                      placeholder="+91 80000 11111"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Line Items Card */}
              <div className="card-panel">
                <div className="card-title">
                  <span>Line Items</span>
                  <span className="card-subtitle">Add items, quantities, prices, tax and discounts</span>
                </div>

                <div className="items-table-wrapper">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: '25%' }}>Item / Service</th>
                        <th style={{ width: '20%' }}>Description</th>
                        <th style={{ width: '10%' }}>Qty</th>
                        <th style={{ width: '15%' }}>Unit Price</th>
                        <th style={{ width: '10%' }}>Tax %</th>
                        <th style={{ width: '10%' }}>Disc %</th>
                        <th style={{ width: '10%' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              className="form-control"
                              value={item.name}
                              onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                              placeholder="Item Name"
                            />
                          </td>
                          <td>
                            <input
                              className="form-control"
                              value={item.description}
                              onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                              placeholder="Description"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="form-control"
                              value={item.qty}
                              onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="form-control"
                              value={item.unitPrice}
                              onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="form-control"
                              value={item.taxPercent}
                              onChange={(e) => handleItemChange(idx, 'taxPercent', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="form-control"
                              value={item.discountPercent}
                              onChange={(e) => handleItemChange(idx, 'discountPercent', e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              className="btn-remove"
                              onClick={() => handleRemoveItem(idx)}
                              disabled={items.length <= 1}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button className="btn-add-item" onClick={handleAddItem}>
                  + Add Line Item
                </button>

                {/* Financial Summary */}
                <div className="financial-summary-card">
                  <div className="summary-row">
                    <span>Subtotal:</span>
                    <span>{currency} {calculations.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Total Tax (+):</span>
                    <span>{currency} {calculations.totalTax.toFixed(2)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Total Discount (-):</span>
                    <span>{currency} {calculations.totalDiscount.toFixed(2)}</span>
                  </div>
                  <div className="summary-row grand-total">
                    <span>Grand Total:</span>
                    <span>{currency} {calculations.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Payment & Terms Card */}
              <div className="card-panel">
                <div className="card-title">
                  <span>{isQuotation ? 'Terms & Notes' : 'Payment Details & Terms'}</span>
                </div>

                {!isQuotation && (
                  <div className="form-grid-2" style={{ marginBottom: '16px' }}>
                    <div className="form-group">
                      <label>Bank Name</label>
                      <input
                        className="form-control"
                        value={paymentInfo.bankName}
                        onChange={(e) => setPaymentInfo({ ...paymentInfo, bankName: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Account Number</label>
                      <input
                        className="form-control"
                        value={paymentInfo.accountNo}
                        onChange={(e) => setPaymentInfo({ ...paymentInfo, accountNo: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>IFSC / SWIFT</label>
                      <input
                        className="form-control"
                        value={paymentInfo.ifsc}
                        onChange={(e) => setPaymentInfo({ ...paymentInfo, ifsc: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>UPI ID</label>
                      <input
                        className="form-control"
                        value={paymentInfo.upiId}
                        onChange={(e) => setPaymentInfo({ ...paymentInfo, upiId: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Notes</label>
                  <input
                    className="form-control"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Terms & Conditions</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                  />
                </div>
              </div>

              <div className="action-bar">
                <button className="btn-secondary" onClick={() => setStep(2)}>
                  ← Back to Upload
                </button>
                <button className="btn-primary" onClick={() => setStep(4)}>
                  Go to Live Preview →
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Live Preview & PDF Download */}
          {step === 4 && (
            <div className="card-panel">
              <div className="card-title">
                <span>Step 4: Live Preview & PDF Download</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', marginBottom: '16px' }}>
                Review the exact 20% / 65% / 15% layout positioning before requesting backend PDF generation.
              </p>

              <div className="action-bar" style={{ marginTop: '0' }}>
                <button className="btn-secondary" onClick={() => setStep(3)}>
                  ← Edit Details
                </button>
                <button
                  className="btn-primary"
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                >
                  {isGeneratingPdf ? '⏳ Generating PDF...' : '⬇️ Download PDF'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* LIVE PREVIEW COLUMN (Shown in Step 4) */}
        {step === 4 && (
          <div className="preview-container">
            <div className="preview-controls-bar">
              <div className="preview-mode-switch">
                <button
                  type="button"
                  className={`preview-mode-btn ${previewMode === 'layout' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('layout')}
                >
                  📐 Layout View
                </button>
                <button
                  type="button"
                  className={`preview-mode-btn ${previewMode === 'pdf' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('pdf')}
                >
                  📄 Real PDF View
                </button>
              </div>

              {previewMode === 'layout' && (
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={showGuidelines}
                    onChange={(e) => setShowGuidelines(e.target.checked)}
                  />
                  20% / 65% / 15% Guides
                </label>
              )}

              {previewMode === 'layout' && previewPages.length > 1 && (
                <div className="page-tabs">
                  {previewPages.map((_, pIdx) => (
                    <button
                      key={pIdx}
                      className={`page-tab ${previewPage === pIdx ? 'active' : ''}`}
                      onClick={() => setPreviewPage(pIdx)}
                    >
                      Page {pIdx + 1} / {previewPages.length}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* REAL PDF EMBEDDED VIEW */}
            {previewMode === 'pdf' && (
              <div>
                {isGeneratingBlob ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '8px', border: '1px solid var(--slate-300)' }}>
                    ⏳ Generating exact PDF rendering...
                  </div>
                ) : pdfPreviewUrl ? (
                  <iframe
                    src={pdfPreviewUrl}
                    title="Exact PDF Document Preview"
                    className="preview-pdf-frame"
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: '8px' }}>
                    Unable to generate PDF preview.
                  </div>
                )}
              </div>
            )}

            {/* A4 INTERACTIVE PAPER VIEW */}
            {previewMode === 'layout' && (
              <div className="paper-sheet">
                {/* Background Layer: Untouched Letterhead */}
                {letterheadData && (
                  <img src={letterheadData} alt="Letterhead Background" className="letterhead-bg-layer" />
                )}

                {/* Layout Zone Visual Guidelines */}
                {showGuidelines && (
                  <>
                    <div className="guideline-header-zone">
                      <div className="guideline-badge">Top 20% Header Protected</div>
                    </div>
                    <div className="guideline-footer-zone">
                      <div className="guideline-badge">Bottom 15% Footer Protected</div>
                    </div>
                  </>
                )}

                {/* Middle 65% Content Area */}
                <div className="paper-content-layer">
                  {/* Document Title & Meta */}
                  <div className="preview-doc-header">
                    <div className="preview-doc-title">{isQuotation ? 'QUOTATION' : 'INVOICE'}</div>
                    <div className="preview-doc-meta">
                      <div>
                        <strong>{isQuotation ? 'Quotation No:' : 'Invoice No:'}</strong>
                        <span>{documentNo || 'N/A'}</span>
                      </div>
                      <div>
                        <strong>{isQuotation ? 'Date:' : 'Invoice Date:'}</strong>
                        <span>{documentDate || 'N/A'}</span>
                      </div>
                      {(isQuotation ? validUntil : dueDate) && (
                        <div>
                          <strong>{isQuotation ? 'Valid Until:' : 'Due Date:'}</strong>
                          <span>{(isQuotation ? validUntil : dueDate) || 'N/A'}</span>
                        </div>
                      )}
                      {referenceNo && (
                        <div>
                          <strong>Ref No:</strong>
                          <span>{referenceNo}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Customer & Company Details Box */}
                  <div className="preview-boxes-grid">
                    <div className="preview-box">
                      <h5>{isQuotation ? 'QUOTATION FOR:' : 'BILLED TO:'}</h5>
                      <div className="preview-box-name">{customer.name || 'Customer Name'}</div>
                      <div className="preview-box-details">
                        {customer.phone && <div>Phone: {customer.phone}</div>}
                        {customer.email && <div>Email: {customer.email}</div>}
                        {customer.address && <div>{customer.address}</div>}
                      </div>
                    </div>

                    <div className="preview-box">
                      <h5>FROM / SUPPLIER:</h5>
                      <div className="preview-box-name">{company.name || 'Company / Business'}</div>
                      <div className="preview-box-details">
                        {company.gstNo && <div>Tax ID / GSTIN: {company.gstNo}</div>}
                        {(company.phone || company.email) && (
                          <div>{[company.phone, company.email].filter(Boolean).join(' | ')}</div>
                        )}
                        {company.address && <div>{company.address}</div>}
                      </div>
                    </div>
                  </div>

                  {/* Items Table: 7 Columns matched 1:1 with jsPDF */}
                  <table className="preview-table-view">
                    <thead>
                      <tr>
                        <th className="col-idx">#</th>
                        <th className="col-desc">ITEM / DESCRIPTION</th>
                        <th className="col-qty">QTY</th>
                        <th className="col-price">PRICE ({currency})</th>
                        <th className="col-tax">TAX %</th>
                        <th className="col-disc">DISC %</th>
                        <th className="col-total">TOTAL ({currency})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewPages[previewPage] || []).map((item, idx) => {
                        const rowIdx = previewPage * 6 + idx;
                        const isEven = rowIdx % 2 === 1;
                        const base = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
                        const tax = (base * (Number(item.taxPercent) || 0)) / 100;
                        const disc = (base * (Number(item.discountPercent) || 0)) / 100;
                        const total = base + tax - disc;
                        return (
                          <tr key={idx} className={isEven ? 'even-row' : ''}>
                            <td className="col-idx">{rowIdx + 1}</td>
                            <td className="col-desc">
                              <div className="preview-item-name">{item.name || item.description || `Item ${rowIdx + 1}`}</div>
                              {item.description && item.name && (
                                <div className="preview-item-desc">{item.description}</div>
                              )}
                            </td>
                            <td className="col-qty">{item.qty || 0}</td>
                            <td className="col-price">{Number(item.unitPrice || 0).toFixed(2)}</td>
                            <td className="col-tax">{Number(item.taxPercent || 0)}%</td>
                            <td className="col-disc">{Number(item.discountPercent || 0)}%</td>
                            <td className="col-total"><strong>{total.toFixed(2)}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Summary & Signatures (Displayed on Final Page) */}
                  {previewPage === previewPages.length - 1 && (
                    <>
                      <div className="preview-summary-view">
                        <div className="preview-summary-left">
                          {!isQuotation && (paymentInfo.bankName || paymentInfo.accountNo || paymentInfo.upiId) && (
                            <div>
                              <div className="preview-summary-section-title">PAYMENT INFORMATION:</div>
                              <div className="preview-summary-text">
                                {paymentInfo.bankName && <div>Bank: {paymentInfo.bankName}</div>}
                                {paymentInfo.accountNo && <div>Account No: {paymentInfo.accountNo}</div>}
                                {paymentInfo.ifsc && <div>IFSC / Swift: {paymentInfo.ifsc}</div>}
                                {paymentInfo.upiId && <div>UPI ID: {paymentInfo.upiId}</div>}
                              </div>
                            </div>
                          )}

                          {(terms || notes) && (
                            <div style={{ marginTop: '4px' }}>
                              <div className="preview-summary-section-title">TERMS & NOTES:</div>
                              <div className="preview-summary-text">
                                {notes && <div>{notes}</div>}
                                {terms && <div>{terms}</div>}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="preview-summary-card">
                          <div className="preview-sum-row">
                            <span>Subtotal:</span>
                            <span>{currency} {calculations.subtotal.toFixed(2)}</span>
                          </div>
                          <div className="preview-sum-row">
                            <span>Tax Amount (+):</span>
                            <span>{currency} {calculations.totalTax.toFixed(2)}</span>
                          </div>
                          <div className="preview-sum-row">
                            <span>Discount (-):</span>
                            <span>{currency} {calculations.totalDiscount.toFixed(2)}</span>
                          </div>
                          <div className="preview-sum-divider" />
                          <div className="preview-sum-grand">
                            <span>GRAND TOTAL:</span>
                            <span>{currency} {calculations.grandTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Authorized Signature matching jsPDF */}
                      <div className="preview-sig-block">
                        <div className="preview-sig-container">
                          <div className="preview-sig-line" />
                          <div className="preview-sig-label">Authorized Signature</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
