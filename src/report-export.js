// Local-only rendering: no financial data is uploaded to an image or PDF service.
const money = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const labels = { Security: 'सुरक्षा / वाई-फाई', Repair: 'मरम्मत व इलेक्ट्रिकल कार्य', Salary: 'कर्मचारियों का वेतन', Electricity: 'बिजली बिल', 'Lift Card Purchase': 'लिफ्ट एक्सेस टोकन खरीद', Lift: 'लिफ्ट सुविधा', Cleaning: 'सफाई सामग्री', Water: 'पानी', General: 'सामान्य खर्च', Other: 'अन्य खर्च' };

function wrap(ctx, value, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(value).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderFundPoster(report, { societyName, outstanding, now = new Date() }) {
  if (report.errors.length) throw new Error(report.errors.join(' '));
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  const ctx = canvas.getContext('2d');
  const font = (size, bold = false) => { ctx.font = `${bold ? 700 : 400} ${size}px Arial, sans-serif`; };
  const categories = Object.entries(report.categoryTotals).sort((a, b) => b[1] - a[1]);
  font(30, true);
  const names = wrap(ctx, societyName || 'SocioLedger', 950);
  const categoryLines = categories.map(([name]) => wrap(ctx, labels[name] || name, 660));
  const categoryHeight = categoryLines.reduce((s, lines) => s + Math.max(84, 32 + lines.length * 38), 0);
  canvas.height = 1300 + names.length * 56 + categoryHeight + (report.fallbackCount ? 84 : 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const text = (value, x, y, size = 30, color = '#102e54', bold = false, align = 'left') => {
    font(size, bold); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(String(value), x, y); ctx.textAlign = 'left';
  };
  const box = (y, height, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(42, y, 996, height, 18); ctx.fill(); };
  let y = 78;
  for (const name of names) { text(name, 540, y, 48, '#102e54', true, 'center'); y += 56; }
  const [year, month] = report.month.split('-');
  const title = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('hi-IN', { month: 'long', year: 'numeric' });
  box(y, 68, '#e6f1fc'); text(`${title} • बिल्डिंग फंड का हिसाब`, 540, y + 45, 34, '#102e54', true, 'center'); y += 102;
  text('राशि प्राप्त होने की तारीख के आधार पर', 540, y, 25, '#58677a', false, 'center'); y += 28;
  const row = (label, value, color, note = '') => {
    box(y, note ? 104 : 82, color); text(label, 68, y + 49, 31, '#102e54', true); text(money(value), 1008, y + 49, 39, '#102e54', true, 'right');
    if (note) text(note, 68, y + 83, 22, '#58677a');
    y += note ? 116 : 94;
  };
  row('शुरुआती उपलब्ध फंड', report.opening, '#e6f1fc');
  row('महीने में कुल जमा राशि', report.totalReceipts, '#e2f4ef', 'मेंटेनेंस एवं सुविधा सुधार हेतु जमा राशि सहित');
  row('खर्च से पहले कुल फंड', report.availableBeforeExpenses, '#fff1d3');
  y += 8; box(y, 72, '#102e54'); text('इस महीने कहाँ खर्च हुआ?', 540, y + 48, 36, '#ffffff', true, 'center'); y += 86;
  categories.forEach(([, amount], index) => {
    const lines = categoryLines[index]; const height = Math.max(84, 32 + lines.length * 38);
    box(y, height - 6, index % 2 ? '#f2f8f9' : '#f1f5fa');
    lines.forEach((line, i) => text(line, 68, y + 48 + i * 38, 30, '#102e54', true));
    text(money(amount), 1008, y + 48, 36, '#102e54', true, 'right'); y += height;
  });
  if (!categories.length) { text('इस महीने कोई खर्च दर्ज नहीं है।', 68, y + 40, 28); y += 70; }
  row('कुल महीने का खर्च', report.expenseTotal, '#fff1d3');
  row('महीने के अंत का उपलब्ध फंड', report.closing, '#cef0e4');
  text(`${money(report.opening)} + ${money(report.totalReceipts)} − ${money(report.expenseTotal)} = ${money(report.closing)}`, 540, y + 24, 28, '#29445f', true, 'center'); y += 54;
  box(y, 114, '#fff0e9'); text(`वर्तमान कुल बकाया: ${money(outstanding)}`, 68, y + 43, 31, '#994220', true);
  text('यह राशि अभी प्राप्त नहीं हुई है; उपलब्ध फंड में शामिल नहीं है।', 68, y + 84, 25, '#58677a'); y += 140;
  if (report.fallbackCount) {
    text('नोट: पुराने रिकॉर्ड की अमान्य/अनुपलब्ध तारीख हेतु दर्ज मेंटेनेंस माह लिया गया है।', 540, y + 16, 22, '#58677a', false, 'center');
    text('Opening में पिछले दर्ज receipts/imported balances शामिल हैं।', 540, y + 48, 22, '#58677a', false, 'center'); y += 84;
  }
  text('स्रोत: SocioLedger में दर्ज रिकॉर्ड', 540, y + 14, 23, '#58677a', false, 'center');
  text(`तैयार: ${now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} • बकाया वर्तमान स्थिति के अनुसार`, 540, y + 48, 21, '#58677a', false, 'center');
  // Crop unused tail while preserving all content.
  const final = document.createElement('canvas'); final.width = canvas.width; final.height = y + 76;
  final.getContext('2d').drawImage(canvas, 0, 0);
  return final;
}

export function posterFilename(societyName, month, extension) {
  return `${String(societyName || 'SocioLedger').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 80)}_${month}_Fund_Summary.${extension}`;
}

export function canvasBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not generate the image.')), type, 0.96));
}

// One-page PDF embeds the same poster as a JPEG, preserving Hindi shaping and layout.
export async function posterPDF(canvas) {
  const jpeg = new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg')).arrayBuffer());
  const encoder = new TextEncoder(); const parts = []; let size = 0; const offsets = [0];
  const append = part => { const bytes = typeof part === 'string' ? encoder.encode(part) : part; parts.push(bytes); size += bytes.length; };
  const width = 595.28; const height = Number((width * canvas.height / canvas.width).toFixed(2));
  append('%PDF-1.4\n');
  const obj = (id, body) => { offsets[id] = size; append(`${id} 0 obj\n${body}\nendobj\n`); };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Poster 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = size; append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); append(jpeg); append('\nendstream\nendobj\n');
  const commands = `q\n${width} 0 0 ${height} 0 0 cm\n/Poster Do\nQ\n`;
  obj(5, `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
  const xref = size; append('xref\n0 6\n0000000000 65535 f \n');
  for (let id = 1; id <= 5; id++) append(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
