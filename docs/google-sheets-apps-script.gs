/**
 * Silver Touch HRMS: Google Sheets backup receiver.
 *
 * Setup (once):
 *  1. Open the backup Google Sheet → Extensions → Apps Script.
 *  2. Replace everything in Code.gs with this file. Put the shared secret in SECRET below.
 *  3. Deploy → New deployment → type "Web app".
 *     Execute as: Me.  Who has access: Anyone.  → Deploy → authorise → copy the Web app URL.
 *  4. Give the URL to whoever manages the HRMS (it goes in GOOGLE_SHEETS_WEBHOOK_URL).
 *
 * The HRMS posts every table here; each tab is cleared and rewritten. Requests without the
 * secret are refused. Face templates and secrets are never sent.
 */
const SECRET = 'PASTE-THE-SHARED-SECRET-HERE';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== SECRET) return json({ ok: false, error: 'Not authorised' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const results = [];
    (body.tabs || []).forEach(function (tab) {
      try {
        const sheet = ss.getSheetByName(tab.name) || ss.insertSheet(tab.name);
        sheet.clearContents();
        const values = tab.values || [];
        if (values.length) {
          const width = values.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
          const rows = values.map(function (r) {
            const out = r.slice();
            while (out.length < width) out.push('');
            return out;
          });
          sheet.getRange(1, 1, rows.length, width).setValues(rows);
          sheet.setFrozenRows(1);
        }
        results.push({ tab: tab.name, ok: true, rows: Math.max(0, values.length - 1) });
      } catch (err) {
        results.push({ tab: tab.name, ok: false, rows: 0, error: String(err) });
      }
    });
    return json({ ok: true, results: results });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: 'Silver Touch HRMS backup receiver' });
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
