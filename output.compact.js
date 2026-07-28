/* GENERATED_FROM=input.js SOURCE_SHA256=91a9067012be8eecf01e6499766566c07916259ac3b2af2447818d92f125ca60 FORMAT=READABLE_COMPACT PRINT_WIDTH=320 BLANK_LINES=SAFE_REMOVE DO_NOT_EDIT */
/* GENERATED_FROM=index.js SOURCE_SHA256=2ad56d77c016d904914e62f417670ddadac2d18e5c1d1869bbbbcc53c7d0d466 FORMAT=READABLE_COMPACT PRINT_WIDTH=320 BLANK_LINES=SAFE_REMOVE DO_NOT_EDIT */
'use strict';
const https = require('https');
const { URL } = require('url');
const SIGNALING_URL = String(process.env.SIGNALING_URL || '').trim();
const SCHEDULER_SECRET = String(process.env.SCHEDULER_SECRET || '').trim();
const TIMEOUT_MS = 55000;
const safe = value => String(value == null ? '' : value).trim();
function postJson(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('invalid_signaling_url'));
      return;
    }
    const body = Buffer.from(JSON.stringify(data || {}), 'utf8');
    const request = https.request({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': body.length, ...headers } }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => (text += chunk));
      response.on('end', () => {
        let payload = {};
        try {
          payload = JSON.parse(text || '{}');
        } catch {}
        resolve({ status: Number(response.statusCode || 0), payload });
      });
    });
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('timeout')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}
exports.handler = async () => {
  if (!SIGNALING_URL || !SCHEDULER_SECRET) {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'scheduler_not_configured' }) };
  }
  try {
    const result = await postJson(SIGNALING_URL, { action: 'loyalty_due_run', limit: 50 }, { 'X-Vi3-Scheduler': SCHEDULER_SECRET });
    const ok = result.status >= 200 && result.status < 300 && result.payload?.ok === true;
    return { statusCode: ok ? 200 : 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok, signalingStatus: result.status, result: result.payload, ts: Date.now() }) };
  } catch (error) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: false, error: safe(error?.message || 'scheduler_failed'), ts: Date.now() }) };
  }
};
