/**
 * Orders.gs - what happens when the owner works in the Orders tab.
 *
 *   onOrdersEdit        (installed trigger) Status/Payment changed -> "Updated" time;
 *                       Status -> Cancelled -> units go back to Products stock, once.
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
