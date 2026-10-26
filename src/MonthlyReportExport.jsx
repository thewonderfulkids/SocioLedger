import { useEffect, useRef, useState } from 'react';
import { canvasBlob, downloadBlob, posterFilename, posterPDF, renderFundPoster } from './report-export.js';

export default function MonthlyReportExport({ report, societyName, outstanding, loadError }) {
  const [prepared, setPrepared] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const current = prepared?.report === report && prepared.societyName === societyName && prepared.outstanding === outstanding ? prepared : null;
  const blocked = loadError || report.errors.join(' ');
  useEffect(() => () => { if (prepared?.url) URL.revokeObjectURL(prepared.url); }, [prepared]);

  async function generate(format) {
    if (lock.current || blocked) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      let result = current;
      if (!result) {
        const canvas = await renderFundPoster(report, { societyName, outstanding });
        const [png, pdf] = await Promise.all([canvasBlob(canvas), posterPDF(canvas)]);
        result = { report, societyName, outstanding, png, pdf, url: URL.createObjectURL(png) };
        setPrepared(result);
      }
      if (format) downloadBlob(result[format], posterFilename(societyName, report.month, format));
      setMessage(format ? `${format.toUpperCase()} downloaded. Attach it in your WhatsApp group.` : 'Report ready. Download PNG/PDF or tap Share image.');
    } catch (error) { setMessage(error.message || 'Report could not be generated. Please retry.'); }
    finally { lock.current = false; setBusy(false); }
  }

  function share() {
    if (!current || busy || blocked) return;
    const file = new File([current.png], posterFilename(societyName, report.month, 'png'), { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] }) || !navigator.share) {
      downloadBlob(current.png, file.name);
      setMessage('Image downloaded. Open your WhatsApp group and attach it from Photos or Files.');
      return;
    }
    // Must run directly from this user gesture, after the file is prepared.
    navigator.share({ files: [file], title: `${societyName} — ${report.month} Fund Summary` }).then(
      () => setMessage('Share sheet completed.'),
      error => setMessage(error.name === 'AbortError' ? 'Sharing cancelled. Your report is still ready.' : 'Could not share. Download the image and attach it in WhatsApp.')
    );
  }

  return <section className="monthlyExport" aria-label="Monthly fund poster export">
    <h2>Resident fund summary</h2>
    <p>October poster style · Hindi · PNG or PDF · No resident names or phone numbers</p>
    <div className="monthlyExportActions">
      <button disabled={busy || !!blocked} onClick={() => generate()}>{busy ? 'Generating…' : 'Preview poster'}</button>
      <button disabled={busy || !!blocked} onClick={() => generate('png')}>Download PNG</button>
      <button disabled={busy || !!blocked} onClick={() => generate('pdf')}>Download PDF</button>
      <button disabled={!current || busy || !!blocked} onClick={share}>Share image</button>
    </div>
    <p className="monthlyExportHint">Choose WhatsApp and your group in the share sheet. If file sharing is unavailable, download the image and attach it manually.</p>
    {blocked && <p role="alert">{blocked}</p>}
    {message && <p role="status">{message}</p>}
    {report.fallbackCount > 0 && <p className="monthlyExportHint">Legacy date note: {report.fallbackCount} imported receipt(s) have an invalid/missing receipt date. Their recorded maintenance month is used once, and this note appears in the poster. No database record is changed.</p>}
    {current && !blocked && <img className="monthlyPosterPreview" src={current.url} alt={`${societyName} ${report.month}: opening ₹${report.opening}, received ₹${report.totalReceipts}, expenses ₹${report.expenseTotal}, closing ₹${report.closing}. Current unpaid dues ₹${outstanding}, excluded from fund.`} />}
  </section>;
}
