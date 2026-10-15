/**
 * Orders.gs - what happens when the owner works in the Orders tab.
 *
 *   onOrdersEdit        (installed trigger) Status/Payment changed -> "Updated" time;
 *                       Status -> Cancelled -> units go back to Products stock, once.
 *                       Payment tab edited -> email (the UPI ID customers pay to changed).
 *   staleOrderReminder  (every 30 min) one email listing unpaid New orders older than 2 hours.
 *                       Nothing is ever cancelled automatically.
 */

const STOCK_WARNING = 'Was cancelled – stock was added back. If this order goes ahead, reduce Stock in Products by hand.';
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
    if (!statusEdited && !touches(col.payment)) return;

    const n = r2 - r1 + 1;
    const rows = sheet.getRange(r1, 1, n, width).getValues();
    const now = new Date();
    // Updated = now for every edited order row (blank rows keep their value).
    sheet.getRange(r1, col.updated + 1, n, 1).setValues(rows.map((row) => [text(row[col.orderId]) ? now : row[col.updated]]));

    if (!statusEdited) return;
    let cancelNeeded = false;
    rows.forEach((row, i) => {
      const cancelled = normKey(row[col.status]) === 'cancelled';
      if (cancelled && row[col.stockHeld] === true) cancelNeeded = true;
      // Un-cancelled after the stock was already returned: never re-subtract automatically - tell the owner.
      if (!cancelled && text(row[col.orderId]) && row[col.stockHeld] === false && text(row[col.itemsJson])) {
        const flag = text(row[col.utrFlag]);
        if (flag.indexOf(STOCK_WARNING) === -1) {
          sheet.getRange(r1 + i, col.utrFlag + 1).setValue(flag ? flag + '\n' + STOCK_WARNING : STOCK_WARNING);
          sheet.getRange(r1 + i, col.status + 1).setNote(STOCK_WARNING);
        }
      }
    });
    if (cancelNeeded && returnCancelledStock_() > 0) pushLiveFeed('cancel');
  } catch (err) {
    console.error('onOrdersEdit: ' + (err && err.stack ? err.stack : err));
  }
}

/**
 * Every order with Status Cancelled and "Stock held" ticked: add its units back to Products and
 * untick "Stock held" so it happens exactly once. Returns the number of orders handled.
 * Also run by the 5-minute timer, in case an edit could not get the lock.
 */
function returnCancelledStock_() {
  const sheet = ordersSheet_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return 0; // busy - the 5-minute timer will try again
  try {
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return 0;
    const col = orderColumns_(values[0]);
    const targets = [];
    for (let r = 1; r < values.length; r++) {
      if (normKey(values[r][col.status]) === 'cancelled' && values[r][col.stockHeld] === true) targets.push(r);
    }
    if (!targets.length) return 0;

    const pSheet = findSheet_(productsSpreadsheet_(), 'Products');
    if (!pSheet) throw new Error('Products tab not found');
    const pValues = pSheet.getDataRange().getValues();
    const idCol = findCol(pValues[0], PRODUCT_COLUMNS.id);
    const stockCol = findCol(pValues[0], PRODUCT_COLUMNS.stock);
    if (idCol < 0 || stockCol < 0) throw new Error('Products tab needs ID and Stock columns');
    const rowById = new Map();
    for (let r = 1; r < pValues.length; r++) {
      const id = text(pValues[r][idCol]);
      if (id && !rowById.has(id)) rowById.set(id, r); // first row with the ID, like the website
    }

    const add = new Map();
    targets.forEach((r) => {
      const row = values[r];
      const problems = [];
      let lines = [];
      try {
        lines = JSON.parse(unguardText(text(row[col.itemsJson])) || '[]');
      } catch (err) {
        problems.push('ItemsJSON unreadable – return stock by hand');
      }
      lines.forEach((l) => {
        const qty = parseIntSafe(l.qty, 0);
        if (!rowById.has(l.id)) problems.push('Stock not returned for ' + l.id + ' (ID not in Products) – add by hand');
        else if (qty > 0) add.set(l.id, (add.get(l.id) || 0) + qty);
      });
      sheet.getRange(r + 1, col.stockHeld + 1).setValue(false);
      if (problems.length) {
        const flag = text(row[col.utrFlag]);
        sheet.getRange(r + 1, col.utrFlag + 1).setValue((flag ? flag + '\n' : '') + problems.join('\n'));
      }
    });
    add.forEach((qty, id) => {
      const r = rowById.get(id);
      pSheet.getRange(r + 1, stockCol + 1).setValue(parseIntSafe(pValues[r][stockCol], 0) + qty);
    });
    SpreadsheetApp.flush();
    return targets.length;
  } finally {
    lock.releaseLock();
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
  const sent = sendMailSafely_(settings.AlertEmail, stale.length + ' unpaid order' + (stale.length > 1 ? 's' : '') + ' waiting over ' + STALE_HOURS + ' h', lines.join('\n'));
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
