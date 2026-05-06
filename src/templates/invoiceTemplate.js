module.exports = function generateInvoiceHTML({
  billNumber,
  date,
  companyName,
  companyAddress,
  companyPhone,
  companyLogo,
  customerName,
  vehicleNumber,
  vehicleType,
  meterReading,
  items,
  total,
  terms = "1. Payment due within 15 days.\n2. Subject to Mumbai jurisdiction.",
  authorizedSignatory = "Authorized Signatory"
}) {
  const itemsHTML = items.map(item => `
    <tr>
      <td>${item.sl}</td>
      <td>${item.particulars}</td>
      <td>${item.rate}</td>
      <td>${item.amount}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; background: #fff; padding: 40px; }
    .invoice-box { max-width: 800px; margin: auto; border: 2px solid #333; padding: 30px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
    .logo { width: 80px; height: 80px; object-fit: contain; }
    .company-info { text-align: center; flex: 1; }
    .company-name { font-size: 28px; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
    .address { font-size: 14px; color: #555; }
    .bill-details { text-align: right; }
    .bill-details p { font-size: 14px; margin: 2px 0; }
    .customer-section { margin: 20px 0; display: flex; justify-content: space-between; }
    .customer-section div { width: 48%; }
    .label { font-weight: bold; }
    .meta-table { width: 100%; margin-bottom: 20px; }
    .meta-table td { padding: 5px 0; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .items-table th, .items-table td { border: 1px solid #333; padding: 8px; text-align: left; }
    .items-table th { background: #eee; }
    .total-row td { font-weight: bold; }
    .terms-section { margin-top: 30px; font-size: 12px; border-top: 1px dashed #333; padding-top: 10px; }
    .signature-section { display: flex; justify-content: space-between; margin-top: 30px; }
    .signature-box { width: 200px; border-top: 1px solid #333; padding-top: 5px; font-size: 12px; text-align: center; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #777; border-top: 1px solid #ccc; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="invoice-box">
    <div class="header">
      <div>
        <img src="${companyLogo}" class="logo" alt="Logo" onerror="this.style.display='none'">
      </div>
      <div class="company-info">
        <div class="company-name">${companyName}</div>
        <div class="address">${companyAddress}</div>
        <div class="address">Phone: ${companyPhone}</div>
      </div>
      <div class="bill-details">
        <p><strong>Bill No:</strong> ${billNumber}</p>
        <p><strong>Date:</strong> ${date}</p>
      </div>
    </div>

    <div class="customer-section">
      <div>
        <p><span class="label">To,</span><br>${customerName}</p>
      </div>
      <div>
        <table class="meta-table">
          <tr><td><strong>Vehicle No:</strong></td><td>${vehicleNumber}</td></tr>
          <tr><td><strong>Vehicle Type:</strong></td><td>${vehicleType}</td></tr>
          <tr><td><strong>Meter Reading:</strong></td><td>${meterReading}</td></tr>
        </table>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr><th>SL No</th><th>Particulars</th><th>Rate</th><th>Amount</th></tr>
      </thead>
      <tbody>
        ${itemsHTML}
        <tr class="total-row"><td colspan="3">Total</td><td>${total}</td></tr>
      </tbody>
    </table>

    <div class="terms-section">
      <strong>Terms & Conditions:</strong><br>
      ${terms.replace(/\n/g, '<br>')}
    </div>

    <div class="signature-section">
      <div class="signature-box">${authorizedSignatory}</div>
      <div class="signature-box">Customer Signature</div>
    </div>

    <div class="footer">This is a computer-generated invoice.</div>
  </div>
</body>
</html>`;
};