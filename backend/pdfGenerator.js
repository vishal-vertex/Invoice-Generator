import { jsPDF } from 'jspdf';

/**
 * Generates a PDF buffer for a Quotation or Invoice based on the provided letterhead and form data.
 * Strictly enforces:
 * - Top 15% header protection
 * - Bottom 15% footer protection
 * - Middle 70% content area (+ 5mm safety gap inside)
 * - Multi-page pagination with repeated letterhead background and table headers
 */
export async function generatePdfBuffer(payload) {
  const {
    documentType = 'invoice', // 'quotation' | 'invoice'
    pageSize = 'a4', // 'a4' | 'letter'
    currency = '₹',
    letterheadData, // base64 data URL
    documentNo = '',
    documentDate = '',
    dueDate = '', // Invoice
    validUntil = '', // Quotation
    referenceNo = '',
    customer = {},
    company = {},
    items = [],
    notes = '',
    terms = '',
    paymentInfo = {},
  } = payload;

  const isQuotation = documentType.toLowerCase() === 'quotation';
  const format = pageSize.toLowerCase() === 'letter' ? 'letter' : 'a4';
  const doc = new jsPDF({ format, unit: 'mm', orientation: 'portrait' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Layout Boundaries (20% Top, 65% Middle, 15% Bottom)
  const topBoundary = pageHeight * 0.20;
  const bottomBoundary = pageHeight * 0.85;
  const safetyMargin = 5; // 5mm gap inside the 65% middle zone

  const minY = topBoundary + safetyMargin;
  const maxY = bottomBoundary - safetyMargin;
  const contentWidth = pageWidth - 24; // 12mm side margins
  const startX = 12;

  let currentY = minY;
  let pageCount = 1;

  // Helper to add letterhead background to current page
  function renderLetterheadBackground() {
    if (letterheadData && typeof letterheadData === 'string' && letterheadData.startsWith('data:image')) {
      try {
        const imageType = letterheadData.includes('png') ? 'PNG' : 'JPEG';
        doc.addImage(letterheadData, imageType, 0, 0, pageWidth, pageHeight);
      } catch (e) {
        console.error('Failed to add letterhead image to PDF:', e);
      }
    }
  }

  // Helper to start a new page safely
  function startNewPage() {
    doc.addPage(format, 'portrait');
    pageCount++;
    renderLetterheadBackground();
    currentY = minY;
  }

  // Render initial background on page 1
  renderLetterheadBackground();

  // --- 1. Document Title & Header Info ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900

  const title = isQuotation ? 'QUOTATION' : 'INVOICE';
  doc.text(title, startX, currentY + 5);

  // Document Details (Right aligned)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const detailsX = pageWidth - startX - 60;
  let detailY = currentY + 1;

  const docNoLabel = isQuotation ? 'Quotation No:' : 'Invoice No:';
  const docDateLabel = isQuotation ? 'Date:' : 'Invoice Date:';
  const docSecDateLabel = isQuotation ? 'Valid Until:' : 'Due Date:';

  doc.text(docNoLabel, detailsX, detailY);
  doc.setFont('helvetica', 'normal');
  doc.text(documentNo || 'N/A', detailsX + 28, detailY);

  detailY += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text(docDateLabel, detailsX, detailY);
  doc.setFont('helvetica', 'normal');
  doc.text(documentDate || 'N/A', detailsX + 28, detailY);

  if (isQuotation ? validUntil : dueDate) {
    detailY += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.text(docSecDateLabel, detailsX, detailY);
    doc.setFont('helvetica', 'normal');
    doc.text((isQuotation ? validUntil : dueDate) || 'N/A', detailsX + 28, detailY);
  }

  if (referenceNo) {
    detailY += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.text('Ref No:', detailsX, detailY);
    doc.setFont('helvetica', 'normal');
    doc.text(referenceNo, detailsX + 28, detailY);
  }

  currentY = Math.max(currentY + 12, detailY + 4);

  // --- 2. Customer & Company Details Box ---
  const boxY = currentY;
  const boxWidth = (contentWidth - 6) / 2;
  const boxHeight = 28;

  // Left Box: Customer Details
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(startX, boxY, boxWidth, boxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(isQuotation ? 'QUOTATION FOR:' : 'BILLED TO:', startX + 4, boxY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const custName = (customer.name || 'Customer Name').slice(0, 40);
  doc.text(custName, startX + 4, boxY + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  let custSubY = boxY + 14.5;
  if (customer.phone) {
    doc.text(`Phone: ${customer.phone}`, startX + 4, custSubY);
    custSubY += 4;
  }
  if (customer.email) {
    doc.text(`Email: ${customer.email}`, startX + 4, custSubY);
    custSubY += 4;
  }
  if (customer.address) {
    const splitAddr = doc.splitTextToSize(customer.address, boxWidth - 8);
    doc.text(splitAddr.slice(0, 2), startX + 4, custSubY);
  }

  // Right Box: Company Details (Optional if present)
  const rightBoxX = startX + boxWidth + 6;
  doc.roundedRect(rightBoxX, boxY, boxWidth, boxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('FROM / SUPPLIER:', rightBoxX + 4, boxY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const compName = (company.name || 'Company / Business').slice(0, 40);
  doc.text(compName, rightBoxX + 4, boxY + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  let compSubY = boxY + 14.5;
  if (company.gstNo) {
    doc.text(`Tax ID / GSTIN: ${company.gstNo}`, rightBoxX + 4, compSubY);
    compSubY += 4;
  }
  if (company.phone || company.email) {
    const contactStr = [company.phone, company.email].filter(Boolean).join(' | ');
    doc.text(contactStr, rightBoxX + 4, compSubY);
    compSubY += 4;
  }
  if (company.address) {
    const splitCompAddr = doc.splitTextToSize(company.address, boxWidth - 8);
    doc.text(splitCompAddr.slice(0, 2), rightBoxX + 4, compSubY);
  }

  currentY = boxY + boxHeight + 6;

  // --- 3. Items Table ---
  // Columns: # (10mm), Item & Description (auto ~66mm), Qty (16mm), Price (24mm), Tax% (18mm), Disc% (18mm), Total (26mm)
  const colWidths = {
    idx: 8,
    desc: contentWidth - (8 + 16 + 24 + 18 + 18 + 26),
    qty: 16,
    price: 24,
    tax: 18,
    disc: 18,
    total: 26,
  };

  function renderTableHeader(y) {
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(startX, y, contentWidth, 7, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);

    let curX = startX + 2;
    doc.text('#', curX, y + 4.8);
    curX += colWidths.idx;

    doc.text('ITEM / DESCRIPTION', curX, y + 4.8);
    curX += colWidths.desc;

    doc.text('QTY', curX + colWidths.qty - 2, y + 4.8, { align: 'right' });
    curX += colWidths.qty;

    doc.text(`PRICE (${currency})`, curX + colWidths.price - 2, y + 4.8, { align: 'right' });
    curX += colWidths.price;

    doc.text('TAX %', curX + colWidths.tax - 2, y + 4.8, { align: 'right' });
    curX += colWidths.tax;

    doc.text('DISC %', curX + colWidths.disc - 2, y + 4.8, { align: 'right' });
    curX += colWidths.disc;

    doc.text(`TOTAL (${currency})`, curX + colWidths.total - 2, y + 4.8, { align: 'right' });

    return y + 8;
  }

  // Draw initial table header
  currentY = renderTableHeader(currentY);

  // Render Table Rows
  const validItems = Array.isArray(items) && items.length > 0 ? items : [{ name: 'Default Item', qty: 1, unitPrice: 0 }];

  validItems.forEach((item, index) => {
    const itemName = item.name || item.description || `Item ${index + 1}`;
    const itemDesc = item.description && item.name ? item.description : '';
    const qty = Math.max(0, Number(item.qty) || 0);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    const taxPercent = Math.max(0, Number(item.taxPercent) || 0);
    const discountPercent = Math.max(0, Number(item.discountPercent) || 0);

    const basePrice = qty * unitPrice;
    const taxAmount = (basePrice * taxPercent) / 100;
    const discountAmount = (basePrice * discountPercent) / 100;
    const lineTotal = basePrice + taxAmount - discountAmount;

    // Calculate row text wrapping & height
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const descLines = doc.splitTextToSize(itemName + (itemDesc ? `\n${itemDesc}` : ''), colWidths.desc - 4);
    const rowHeight = Math.max(7, descLines.length * 4 + 3);

    // Check boundary before drawing row
    if (currentY + rowHeight > maxY) {
      startNewPage();
      currentY = renderTableHeader(currentY);
    }

    // Row alternating background
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(startX, currentY - 1, contentWidth, rowHeight, 'F');
    }

    // Bottom subtle line
    doc.setDrawColor(241, 245, 249);
    doc.line(startX, currentY + rowHeight - 1, startX + contentWidth, currentY + rowHeight - 1);

    doc.setTextColor(30, 41, 59);
    let curX = startX + 2;

    // Index
    doc.text(String(index + 1), curX, currentY + 3.8);
    curX += colWidths.idx;

    // Description multiline
    doc.text(descLines, curX, currentY + 3.8);
    curX += colWidths.desc;

    // Qty
    doc.text(String(qty), curX + colWidths.qty - 2, currentY + 3.8, { align: 'right' });
    curX += colWidths.qty;

    // Price
    doc.text(unitPrice.toFixed(2), curX + colWidths.price - 2, currentY + 3.8, { align: 'right' });
    curX += colWidths.price;

    // Tax %
    doc.text(`${taxPercent}%`, curX + colWidths.tax - 2, currentY + 3.8, { align: 'right' });
    curX += colWidths.tax;

    // Disc %
    doc.text(`${discountPercent}%`, curX + colWidths.disc - 2, currentY + 3.8, { align: 'right' });
    curX += colWidths.disc;

    // Total
    doc.setFont('helvetica', 'bold');
    doc.text(lineTotal.toFixed(2), curX + colWidths.total - 2, currentY + 3.8, { align: 'right' });

    currentY += rowHeight;
  });

  currentY += 4;

  // --- 4. Totals & Notes Section ---
  // Compute Grand Totals
  const subtotal = validItems.reduce((acc, item) => acc + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0), 0);
  const totalTax = validItems.reduce((acc, item) => {
    const base = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
    return acc + (base * (Number(item.taxPercent) || 0)) / 100;
  }, 0);
  const totalDiscount = validItems.reduce((acc, item) => {
    const base = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
    return acc + (base * (Number(item.discountPercent) || 0)) / 100;
  }, 0);
  const grandTotal = subtotal + totalTax - totalDiscount;

  const summaryBlockHeight = 45;

  // Check boundary for Summary Block
  if (currentY + summaryBlockHeight > maxY) {
    startNewPage();
  }

  const summaryY = currentY;

  // Left Column: Payment Details / Terms / Notes
  const leftColWidth = contentWidth * 0.58;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);

  let leftY = summaryY;

  if (!isQuotation && (paymentInfo.bankName || paymentInfo.accountNo || paymentInfo.upiId)) {
    doc.text('PAYMENT INFORMATION:', startX, leftY + 3);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    leftY += 6.5;

    if (paymentInfo.bankName) {
      doc.text(`Bank: ${paymentInfo.bankName}`, startX, leftY);
      leftY += 3.8;
    }
    if (paymentInfo.accountNo) {
      doc.text(`Account No: ${paymentInfo.accountNo}`, startX, leftY);
      leftY += 3.8;
    }
    if (paymentInfo.ifsc) {
      doc.text(`IFSC / Swift: ${paymentInfo.ifsc}`, startX, leftY);
      leftY += 3.8;
    }
    if (paymentInfo.upiId) {
      doc.text(`UPI ID: ${paymentInfo.upiId}`, startX, leftY);
      leftY += 3.8;
    }
    leftY += 2;
  }

  if (terms || notes) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('TERMS & NOTES:', startX, leftY + 3);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    leftY += 6.5;

    const termsText = [notes, terms].filter(Boolean).join('\n');
    const splitTerms = doc.splitTextToSize(termsText, leftColWidth - 4);
    doc.text(splitTerms.slice(0, 4), startX, leftY);
  }

  // Right Column: Summary Box
  const rightColX = startX + leftColWidth + 4;
  const rightColWidth = contentWidth - leftColWidth - 4;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightColX, summaryY, rightColWidth, 38, 2, 2, 'FD');

  let sumRowY = summaryY + 6;
  doc.setFontSize(8.5);

  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal:', rightColX + 4, sumRowY);
  doc.text(`${currency} ${subtotal.toFixed(2)}`, rightColX + rightColWidth - 4, sumRowY, { align: 'right' });
  sumRowY += 5.5;

  // Tax Total
  doc.text('Tax Amount (+):', rightColX + 4, sumRowY);
  doc.text(`${currency} ${totalTax.toFixed(2)}`, rightColX + rightColWidth - 4, sumRowY, { align: 'right' });
  sumRowY += 5.5;

  // Discount Total
  doc.text('Discount (-):', rightColX + 4, sumRowY);
  doc.text(`${currency} ${totalDiscount.toFixed(2)}`, rightColX + rightColWidth - 4, sumRowY, { align: 'right' });
  sumRowY += 6.5;

  // Divider
  doc.setDrawColor(203, 213, 225);
  doc.line(rightColX + 4, sumRowY - 2, rightColX + rightColWidth - 4, sumRowY - 2);

  // Grand Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('GRAND TOTAL:', rightColX + 4, sumRowY + 3);
  doc.text(`${currency} ${grandTotal.toFixed(2)}`, rightColX + rightColWidth - 4, sumRowY + 3, { align: 'right' });

  // Signature Block
  currentY = summaryY + summaryBlockHeight;

  if (currentY + 15 <= maxY) {
    const sigX = startX + contentWidth - 45;
    doc.setDrawColor(148, 163, 184);
    doc.line(sigX, currentY + 8, sigX + 45, currentY + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Authorized Signature', sigX + 22.5, currentY + 11.5, { align: 'center' });
  }

  // Convert PDF to Node buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
