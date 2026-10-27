/**
 * Orders.gs - what happens when the owner works in the Orders tab.
 *
 *   onOrdersEdit        (installed trigger) Status/Payment changed -> "Updated" time.
 *                       Payment tab edited -> email (the UPI ID customers pay to changed).
 *                       "Send to supplier" ticked / Status changed -> supplier sheet (Supplier.gs).
 *   staleOrderReminder  (every 30 min) one email listing unpaid New orders older than 2 hours.
 *                       Nothing is ever cancelled automatically.
 */

const STALE_HOURS = 2;

function onOrdersEdit(e) {
  try {
    const range = e && e.range;
    if (!range) return;
    const sheet = range.getSheet();
    if (normKey(sheet.getName()) === normKey(PAYMENT_TAB)) return paymentTabEdited_(e);
    if (normKey(sheet.getName()) !== normKey(ORDERS_TAB)) return;
    const r1 = Math.max(2, range.getRow());
    const r2 = range.getLastRow();
    if (r2 < r1) return;
    const width = sheet.getLastColumn();
    const header = sheet.getRange(1, 1, 1, width).getValues()[0];
    const col = orderColumns_(header);
    const c1 = range.getColumn();
    const c2 = range.getLastColumn();
    const touches = (i) => i + 1 >= c1 && i + 1 <= c2;
    const statusEdited = touches(col.status);
    const supplierCol = findCol(header, [SUPPLIER_COL_HEADER]);
    if (!statusEdited && supplierCol >= 0 && touches(supplierCol)) return syncSupplierSafely_();
    if (!statusEdited && !touches(col.payment)) return;

    const n = r2 - r1 + 1;
    const rows = sheet.getRange(r1, 1, n, width).getValues();
    const now = new Date();
    // Updated = now for every edited order row (blank rows keep their value).
    sheet.getRange(r1, col.updated + 1, n, 1).setValues(rows.map((row) => [text(row[col.orderId]) ? now : row[col.updated]]));

    if (!statusEdited) return;
    if (supplierCol >= 0) syncSupplierSafely_(); // Cancelled -> "do not ship" for the supplier
  } catch (err) {
    console.error('onOrdersEdit: ' + (err && err.stack ? err.stack : err));
  }
}

/* =====================================================================
 * Stale-order reminder (time trigger, every 30 minutes)
 * ===================================================================== */

function staleOrderReminder() {
  const sheet = ordersSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const col = orderColumns_(values[0]);
  const notes = sheet.getRange(2, col.orderId + 1, values.length - 1, 1).getNotes();
  const cutoff = Date.now() - STALE_HOURS * 3600 * 1000;
  const stale = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const created = row[col.created];
    if (normKey(row[col.status]) !== 'new' || normKey(row[col.payment]) !== 'pending') continue;
    if (!(created instanceof Date) || created.getTime() > cutoff) continue;
    if (/reminded/i.test(notes[r - 1][0])) continue;
    stale.push(r);
  }
  if (!stale.length || !prop_('PRODUCTS_SHEET_ID')) return;

  const settings = normalizeSettings(settingsMap_(readSettingsValues_(productsSpreadsheet_())));
  if (!settings.AlertEmail) return; // nobody to remind - leave unmarked

  const lines = ['These orders are still New and unpaid after ' + STALE_HOURS + ' hours:', ''];
  stale.forEach((r) => {
    const row = values[r];
    const phone = unguardText(text(row[col.phone]));
    lines.push(text(row[col.orderId]) + ' · ' + Utilities.formatDate(row[col.created], TZ, 'd MMM HH:mm') + ' · ' +
      unguardText(text(row[col.name])) + ' · ' + formatRupees(row[col.total]) + ' · ' + text(row[col.method]));
    lines.push('   Call tel:+91' + phone + '   WhatsApp https://wa.me/91' + phone);
  });
  lines.push('');
  lines.push('Nothing was cancelled. Follow up, then set Status/Payment in the Orders sheet:');
  lines.push(rowLink_(sheet, stale[0] + 1));
  const sent = sendMailSafely_(settings.AlertEmail, stale.length + ' unpaid order' + (stale.length > 1 ? 's' : '') + ' waiting over ' + STALE_HOURS + ' h', lines.join('\n'), ORDER_LABEL);
  if (!sent.ok) return; // try again next time

  const mark = 'stale – reminded ' + nowText_();
  stale.forEach((r) => {
    const old = notes[r - 1][0];
    sheet.getRange(r + 1, col.orderId + 1).setNote(old ? old + '\n' + mark : mark);
  });
}

/* =====================================================================
 * Payment tab: the UPI ID customers pay to
 * ===================================================================== */
// Lives in this private Orders file, not in the Products file that staff can edit, so only the owner can
// change where the money goes. Every change is emailed to AlertEmail and to the script owner. The ID is
// read when an order is placed and saved with that order in the customer's browser.

const PAYMENT_TAB = 'Payment';
const PAYMENT_ROWS = [
  ['UpiId', '', 'Your shop UPI ID, e.g. onemore@okicici. Shown on the order page for UPI orders. Every change is emailed to you.'],
  ['UpiName', '', 'The exact name a UPI app shows for this ID (start a payment from another phone to see it). Customers are told to check it before paying.'],
];
const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

// { upiId, upiName } for the website (blank when missing or not a valid UPI ID), plus what is typed (rawId, rawName).
function paymentDetails_() {
  const sheet = findSheet_(ordersSpreadsheet_(), PAYMENT_TAB);
  const values = sheet ? sheet.getDataRange().getValues() : [[]];
  const valueCol = settingsCols_(values[0]).valueCol;
  const get = (key) => {
    const r = settingsRowOf_(values, key);
    return r ? unguardText(text(values[r - 1][valueCol])) : '';
  };
  const rawId = get('UpiId').replace(/\s+/g, '');
  const rawName = get('UpiName');
  const valid = UPI_ID_PATTERN.test(rawId);
  return { upiId: valid ? rawId : '', upiName: valid ? rawName.slice(0, 80) : '', rawId: rawId, rawName: rawName };
}

function paymentFingerprint_(pay) {
  return pay.rawId + ' | ' + pay.rawName;
}

// Called by onOrdersEdit for edits in the Payment tab.
function paymentTabEdited_(e) {
  const props = PropertiesService.getScriptProperties();
  const pay = paymentDetails_();
  const before = props.getProperty('PAYMENT_LAST') || '';
  const now = paymentFingerprint_(pay);
  if (now === before) return;
  props.setProperty('PAYMENT_LAST', now);

  let who = '';
  try {
    who = (e && e.user && e.user.getEmail()) || '';
  } catch (err) {
    who = '';
  }
  const lines = [
    'The UPI details customers pay to were changed in the Orders file (Payment tab).',
    '',
    'Before: ' + (before || '(not recorded)'),
    'Now:    ' + now,
    'By:     ' + (who || 'not known – see File → Version history in the Orders file'),
    'When:   ' + Utilities.formatDate(new Date(), TZ, 'd MMM yyyy, h:mm a'),
    '',
    pay.upiId ? 'New UPI orders will show ' + pay.upiId + '.' : 'This is not a valid UPI ID, so the order page falls back to upiId in shop.config.json.',
    '',
    'If you did not make this change, fix the Payment tab now, check who has access to the Orders file, and change your Google password.',
  ];
  let to = [];
  try {
    to.push(normalizeSettings(settingsMap_(readSettingsValues_(productsSpreadsheet_()))).AlertEmail);
  } catch (err) {
    console.error('Payment alert: could not read AlertEmail: ' + err);
  }
  to.push(Session.getEffectiveUser().getEmail());
  to = to.filter(Boolean).join(',');
  if (to) sendMailSafely_(to, 'oneMore: UPI details changed', lines.join('\n'));
}

// Made by setupOrdersFile. Existing values are kept.
function setupPaymentTab_(ss) {
  const sheet = findSheet_(ss, PAYMENT_TAB) || ss.insertSheet(PAYMENT_TAB);
  if (sheet.getLastRow() < 1) sheet.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Notes']]);
  const values = sheet.getDataRange().getValues();
  const missing = PAYMENT_ROWS.filter((r) => !settingsRowOf_(values, r[0]));
  if (missing.length) sheet.getRange(values.length + 1, 1, missing.length, 3).setValues(missing);
  styleHeader_(sheet, 3);
  sheet.getRange(2, 2, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@');
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 280);
  sheet.setColumnWidth(3, 520);
  sheet.getRange(1, 3, sheet.getMaxRows(), 1).setWrap(true);
  // Start from what is there now, so only later changes are reported.
  PropertiesService.getScriptProperties().setProperty('PAYMENT_LAST', paymentFingerprint_(paymentDetails_()));
}
