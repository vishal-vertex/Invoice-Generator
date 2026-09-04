import { jsPDF } from 'jspdf';

/**
 * Converts any image format (SVG, WEBP, etc.) to a standard PNG data URL
 * so jsPDF can reliably render it on every browser without crashing.
 */
export function normalizeImageDataUrl(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      return resolve(null);
    }
    if (dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
      return resolve(dataUrl);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 1200;
        canvas.height = img.naturalHeight || img.height || 1697;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('Could not convert image to PNG canvas, using raw format:', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Builds the jsPDF document instance with strict layout and styling
 * exactly matching the Layout Preview:
 * - Top 20% header protection
 * - Bottom 15% footer protection
 * - Middle 65% content area (+ 5mm safety gap inside)
 * - Multi-page pagination with repeated letterhead background and table headers
 * - Navy #0F172A brand colors, cyan divider, styled cards, 7-column table
 */
export async function buildPdfDocument(payload) {
  const {
    documentType = 'invoice',
    pageSize = 'a4',
    currency = '₹',
    letterheadData,
    documentNo = '',
    documentDate = '',
    dueDate = '',
    validUntil = '',
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

  // Protect letterhead boundaries (Top 20%, Middle 65%, Bottom 15%)
  const topBoundary = pageHeight * 0.20;
  const bottomBoundary = pageHeight * 0.85;
  const safetyMargin = 5;

  const minY = topBoundary + safetyMargin;
  const maxY = bottomBoundary - safetyMargin;
  const contentWidth = pageWidth - 24; // 12mm left/right margin
  const startX = 12;
  const rightMargin = startX + contentWidth;

  let currentY = minY;

  // Normalize currency: standard PDF Helvetica does not contain Unicode Rupee (₹).
  // Safely default ₹ to 'Rs.' to prevent broken character rendering, while preserving $, €, £, etc.
  const safeCurrency = (!currency || currency === '₹') ? 'Rs.' : currency;

  // Normalize letterhead image for browser compatibility
  const safeLetterhead = await normalizeImageDataUrl(letterheadData);

  function renderLetterheadBackground() {
    if (safeLetterhead && typeof safeLetterhead === 'string' && safeLetterhead.startsWith('data:image')) {
      try {
        const imageType = safeLetterhead.includes('png') ? 'PNG' : 'JPEG';
        doc.addImage(safeLetterhead, imageType, 0, 0, pageWidth, pageHeight);
      } catch (e) {
        console.error('Failed to add letterhead image to PDF:', e);
      }
    }
  }

  function startNewPage() {
    doc.addPage(format, 'portrait');
    renderLetterheadBackground();
    currentY = minY;
  }

  // Render letterhead on initial page
  renderLetterheadBackground();

  // --- 1. Document Title & Header Meta Row ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // slate-900 / primary navy

  const title = isQuotation ? 'QUOTATION' : 'INVOICE';
  doc.text(title, startX, currentY + 5.5);

  // Document Details (Right aligned matching Layout Preview)
  const metaRows = [
    {
      label: isQuotation ? 'Quotation No:' : 'Invoice No:',
      val: documentNo || 'N/A',
    },
    {
      label: isQuotation ? 'Date:' : 'Invoice Date:',
      val: documentDate || 'N/A',
    },
  ];

  if (isQuotation ? validUntil : dueDate) {
    metaRows.push({
      label: isQuotation ? 'Valid Until:' : 'Due Date:',
      val: (isQuotation ? validUntil : dueDate) || 'N/A',
    });
  }

  if (referenceNo) {
    metaRows.push({
      label: 'Ref No:',
      val: referenceNo,
    });
  }

  let detailY = currentY + 1.5;
  metaRows.forEach((row) => {
    // Value in regular text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text(row.val, rightMargin, detailY, { align: 'right' });

    const valWidth = doc.getTextWidth(row.val);

    // Label in bold text immediately to the left of the value
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(row.label, rightMargin - valWidth - 1.5, detailY, { align: 'right' });

    detailY += 4.2;
  });

  const headerBottomY = Math.max(currentY + 10, detailY);

  // Cyan Accent Line (ReportLab & Modern Executive Concept)
  doc.setFillColor(0, 149, 232); // #0095E8 Accent Cyan
  doc.rect(startX, headerBottomY + 1, contentWidth, 0.6, 'F');

  currentY = headerBottomY + 4;

  // --- 2. Customer & Company Details Boxes (Two equal columns) ---
  const boxGap = 6;
  const boxWidth = (contentWidth - boxGap) / 2;
  const leftBoxX = startX;
  const rightBoxX = startX + boxWidth + boxGap;

  // Prepare customer details
  const custName = customer.name || 'Customer Name';
  const custLines = [];
  if (customer.phone) custLines.push(`Phone: ${customer.phone}`);
  if (customer.email) custLines.push(`Email: ${customer.email}`);
  if (customer.address) {
    const splitCust = doc.splitTextToSize(customer.address, boxWidth - 8);
    custLines.push(...splitCust.slice(0, 2));
  }

  // Prepare company details
  const compName = company.name || 'Company / Business';
  const compLines = [];
  if (company.gstNo) compLines.push(`Tax ID / GSTIN: ${company.gstNo}`);
  if (company.phone || company.email) {
    compLines.push([company.phone, company.email].filter(Boolean).join(' | '));
  }
  if (company.address) {
    const splitComp = doc.splitTextToSize(company.address, boxWidth - 8);
    compLines.push(...splitComp.slice(0, 2));
  }

  // Calculate box height dynamically to comfortably fit all lines
  const totalLeftLines = 2 + custLines.length;
  const totalRightLines = 2 + compLines.length;
  const maxCardLines = Math.max(totalLeftLines, totalRightLines, 4);
  const boxHeight = Math.max(26, 10 + maxCardLines * 3.6);
  const boxY = currentY;

  // Left Box: Customer Details
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(leftBoxX, boxY, boxWidth, boxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(isQuotation ? 'QUOTATION FOR:' : 'BILLED TO:', leftBoxX + 4, boxY + 4.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(custName.slice(0, 38), leftBoxX + 4, boxY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105); // slate-600
  let custLineY = boxY + 13;
  custLines.forEach((line) => {
    doc.text(line, leftBoxX + 4, custLineY);
    custLineY += 3.6;
  });

  // Right Box: Company Details (Explicitly reset fill and stroke to prevent black box bug)
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(rightBoxX, boxY, boxWidth, boxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('FROM / SUPPLIER:', rightBoxX + 4, boxY + 4.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(compName.slice(0, 38), rightBoxX + 4, boxY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105); // slate-600
  let compLineY = boxY + 13;
  compLines.forEach((line) => {
    doc.text(line, rightBoxX + 4, compLineY);
    compLineY += 3.6;
  });

  currentY = boxY + boxHeight + 5;

  // --- 3. Items Table (7 Columns matched exactly to Layout Preview) ---
  // Widths: # (8mm), Description (76mm), Qty (16mm), Price (24mm), Tax (18mm), Disc (18mm), Total (26mm) = 186mm
  const colWidths = {
    idx: 8,
    desc: 76,
    qty: 16,
    price: 24,
    tax: 18,
    disc: 18,
    total: 26,
  };

  function renderTableHeader(y) {
    doc.setFillColor(15, 23, 42); // slate-900 / navy
    doc.roundedRect(startX, y, contentWidth, 6.5, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    let curX = startX + 2;
    doc.text('#', curX, y + 4.5);
    curX += colWidths.idx;

    doc.text('ITEM / DESCRIPTION', curX, y + 4.5);
    curX += colWidths.desc;

    doc.text('QTY', curX + colWidths.qty - 2, y + 4.5, { align: 'right' });
    curX += colWidths.qty;

    doc.text(`PRICE (${safeCurrency})`, curX + colWidths.price - 2, y + 4.5, { align: 'right' });
    curX += colWidths.price;

    doc.text('TAX %', curX + colWidths.tax - 2, y + 4.5, { align: 'right' });
    curX += colWidths.tax;

    doc.text('DISC %', curX + colWidths.disc - 2, y + 4.5, { align: 'right' });
    curX += colWidths.disc;

    doc.text(`TOTAL (${safeCurrency})`, curX + colWidths.total - 2, y + 4.5, { align: 'right' });

    return y + 7.5;
  }

  currentY = renderTableHeader(currentY);

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

    // Calculate text wrapping for Item Name & Description
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const nameLines = doc.splitTextToSize(itemName, colWidths.desc - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const descLines = itemDesc ? doc.splitTextToSize(itemDesc, colWidths.desc - 4) : [];

    const rowHeight = Math.max(7, nameLines.length * 3.8 + descLines.length * 3.2 + 3);

    // Multi-page page break check
    if (currentY + rowHeight > maxY) {
      startNewPage();
      currentY = renderTableHeader(currentY);
    }

    // Alternating row background
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(startX, currentY, contentWidth, rowHeight, 'F');
    }

    // Subtle bottom border
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(startX, currentY + rowHeight, startX + contentWidth, currentY + rowHeight);

    // 1. Column: #
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(String(index + 1), startX + 2, currentY + 4.5);

    // 2. Column: Description (Item name in bold dark, Description in muted gray below)
    let descY = currentY + 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(nameLines, startX + colWidths.idx + 2, descY);

    if (descLines.length > 0) {
      descY += nameLines.length * 3.6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(descLines, startX + colWidths.idx + 2, descY);
    }

    // Numeric Columns (Right aligned, vertically aligned)
    let numY = currentY + 4.5;
    let curColX = startX + colWidths.idx + colWidths.desc;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);

    // QTY
    doc.text(String(qty), curColX + colWidths.qty - 2, numY, { align: 'right' });
    curColX += colWidths.qty;

    // PRICE
    doc.text(unitPrice.toFixed(2), curColX + colWidths.price - 2, numY, { align: 'right' });
    curColX += colWidths.price;

    // TAX %
    doc.text(`${taxPercent}%`, curColX + colWidths.tax - 2, numY, { align: 'right' });
    curColX += colWidths.tax;

    // DISC %
    doc.text(`${discountPercent}%`, curColX + colWidths.disc - 2, numY, { align: 'right' });
    curColX += colWidths.disc;

    // TOTAL
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(lineTotal.toFixed(2), curColX + colWidths.total - 2, numY, { align: 'right' });

    currentY += rowHeight;
  });

  currentY += 4;

  // --- 4. Totals & Notes Section (Final Page) ---
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

  const summaryBlockHeight = 44;

  if (currentY + summaryBlockHeight > maxY) {
    startNewPage();
  }

  const summaryY = currentY;
  const leftColWidth = contentWidth * 0.54;
  let leftY = summaryY + 1.5;

  // Left Column: Payment Info & Terms/Notes
  if (!isQuotation && (paymentInfo.bankName || paymentInfo.accountNo || paymentInfo.upiId)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('PAYMENT INFORMATION:', startX, leftY);
    leftY += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);

    if (paymentInfo.bankName) {
      doc.text(`Bank: ${paymentInfo.bankName}`, startX, leftY);
      leftY += 3.4;
    }
    if (paymentInfo.accountNo) {
      doc.text(`Account No: ${paymentInfo.accountNo}`, startX, leftY);
      leftY += 3.4;
    }
    if (paymentInfo.ifsc) {
      doc.text(`IFSC / Swift: ${paymentInfo.ifsc}`, startX, leftY);
      leftY += 3.4;
    }
    if (paymentInfo.upiId) {
      doc.text(`UPI ID: ${paymentInfo.upiId}`, startX, leftY);
      leftY += 3.4;
    }
    leftY += 2;
  }

  if (terms || notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('TERMS & NOTES:', startX, leftY);
    leftY += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);

    const termsText = [notes, terms].filter(Boolean).join('\n');
    const splitTerms = doc.splitTextToSize(termsText, leftColWidth - 4);
    doc.text(splitTerms.slice(0, 4), startX, leftY);
    leftY += splitTerms.slice(0, 4).length * 3.4;
  }

  // Right Column: Summary Card (Matching Layout Preview 1:1)
  const rightColX = startX + leftColWidth + 6;
  const rightColWidth = contentWidth - leftColWidth - 6;
  const cardHeight = 35;

  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(rightColX, summaryY, rightColWidth, cardHeight, 2, 2, 'FD');

  let sumRowY = summaryY + 5.5;
  doc.setFontSize(8);

  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal:', rightColX + 4, sumRowY);
  doc.text(`${safeCurrency} ${subtotal.toFixed(2)}`, rightColX + rightColWidth - 4, sumRowY, { align: 'right' });
  sumRowY += 5;

  // Tax Amount
  doc.text('Tax Amount (+):', rightColX + 4, sumRowY);
  doc.text(`${safeCurrency} ${totalTax.toFixed(2)}`, rightColX + rightColWidth - 4, sumRowY, { align: 'right' });
  sumRowY += 5;

  // Discount
  doc.text('Discount (-):', rightColX + 4, sumRowY);
  doc.text(`${safeCurrency} ${totalDiscount.toFixed(2)}`, rightColX + rightColWidth - 4, sumRowY, { align: 'right' });
  sumRowY += 4.5;

  // Divider inside Card
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.3);
  doc.line(rightColX + 4, sumRowY, rightColX + rightColWidth - 4, sumRowY);

  // Grand Total
  sumRowY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('GRAND TOTAL:', rightColX + 4, sumRowY);
  doc.text(`${safeCurrency} ${grandTotal.toFixed(2)}`, rightColX + rightColWidth - 4, sumRowY, { align: 'right' });

  // --- 5. Authorized Signature Block ---
  const finalContentY = summaryY + Math.max(leftY - summaryY, cardHeight) + 8;

  if (finalContentY + 14 <= maxY) {
    const sigWidth = 48;
    const sigX = startX + contentWidth - sigWidth;
    doc.setDrawColor(148, 163, 184); // slate-400
    doc.setLineWidth(0.35);
    doc.line(sigX, finalContentY + 4, sigX + sigWidth, finalContentY + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('Authorized Signature', sigX + sigWidth / 2, finalContentY + 7.5, { align: 'center' });

    if (company.name) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(company.name.slice(0, 30), sigX + sigWidth / 2, finalContentY + 11, { align: 'center' });
    }
  }

  const sanitizedDocNo = (documentNo || 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${documentType}_${sanitizedDocNo}.pdf`;

  return { doc, fileName };
}

/**
 * Generates and downloads the PDF directly in the user's browser.
 */
export async function generateClientPdf(payload) {
  const { doc, fileName } = await buildPdfDocument(payload);
  doc.save(fileName);
  return true;
}

/**
 * Generates a temporary object URL for the PDF to be previewed in an iframe.
 */
export async function generatePdfBlobUrl(payload) {
  const { doc } = await buildPdfDocument(payload);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}
