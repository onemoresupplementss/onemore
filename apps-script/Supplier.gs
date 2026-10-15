/**
 * Supplier.gs - orders the owner ticks "Send to supplier" in the Orders tab are copied to a separate
 * spreadsheet, "oneMore – Supplier orders", that the owner shares with the supplier who ships them.
 *
 * Copied: order number, date, items with quantities, customer name, phone, address, landmark, area,
 * pincode, notes. Never copied: prices, totals, delivery fee, payment method or status, UTR.
 * The supplier's file holds plain values with no link back to the Orders file.
 *
 * The script writes the first columns (protected, only the owner can edit them); the supplier fills
 * "Shipped" and "Tracking / note", and those two come back into the owner's Orders tab ("Supplier shipped",
 * "Supplier note") within seconds of the supplier's edit. An order that is unticked or Cancelled after it was
 * sent stays in the supplier's sheet as "CANCELLED – do not ship", so the supplier sees the change in time.
 *
 *   setupSupplierFile   makes/repairs the supplier file (also run by setupOrdersFile)
 *   syncSupplierSheet   copies ticked orders out and the supplier's Shipped/note back (on every tick/Status
 *                       edit, every supplier edit via onSupplierEdit, and every 5 minutes)
 */

const SUPPLIER_COL_HEADER = 'Send to supplier';
// Written back into the Orders tab from the supplier's own columns.
const SUPPLIER_BACK_HEADERS = ['Supplier shipped', 'Supplier note'];
const SUPPLIER_TAB = 'Orders';
const SUPPLIER_HEADERS = ['Order ID', 'Date', 'Ship?', 'Items', 'Name', 'Phone', 'Address', 'Landmark', 'Area', 'Pincode', 'Notes'];
const SUPPLIER_OWN_HEADERS = ['Shipped (supplier)', 'Tracking / note (supplier)'];
const SUPPLIER_SHIP = 'Ship';
const SUPPLIER_DONT_SHIP = 'CANCELLED – do not ship';

function setupSupplierFile() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  const id = props.getProperty('SUPPLIER_SHEET_ID');
  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (err) {
      throw new Error('SUPPLIER_SHEET_ID is set but that file cannot be opened (' + err.message + '). Fix or delete the property.');
    }
  } else {
    ss = SpreadsheetApp.create('oneMore – Supplier orders');
    props.setProperty('SUPPLIER_SHEET_ID', ss.getId());
  }
  ss.setSpreadsheetTimeZone(TZ);
  const sheet = findSheet_(ss, SUPPLIER_TAB) || ss.insertSheet(SUPPLIER_TAB, 0);
  const header = ensureHeaders_(sheet, SUPPLIER_HEADERS.concat(SUPPLIER_OWN_HEADERS), null);
  styleHeader_(sheet, header.length);
  ensureRows_(sheet, 500);
  const rows = sheet.getMaxRows() - 1;
  const n = SUPPLIER_HEADERS.length;
  sheet.getRange(2, 1, rows, n).setNumberFormat('@').setVerticalAlignment('top');
  sheet.getRange(2, 2, rows, 1).setNumberFormat('d mmm yyyy, h:mm am/pm');
  [4, 7, 11].forEach((c) => sheet.getRange(2, c, rows, 1).setWrap(true));
  const widths = [90, 140, 150, 360, 140, 110, 260, 160, 140, 70, 200, 130, 220];
  widths.forEach((w, i) => i < header.length && sheet.setColumnWidth(i + 1, w));
  sheet.getRange(2, n + 1, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="' + SUPPLIER_DONT_SHIP + '"')
      .setBackground('#fce8e6').setFontColor('#b3261e').setStrikethrough(true).setRanges([sheet.getRange(2, 1, rows, n)]).build(),
  ]);
  removeEmptyDefaultSheet_(ss);

  // Only the owner can change the copied columns; the supplier can edit the last two.
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach((p) => {
    if (p.getDescription() === PROTECT_TAG + ' (supplier copy)') p.remove();
  });
  const p = sheet.getRange(1, 1, sheet.getMaxRows(), n).protect().setDescription(PROTECT_TAG + ' (supplier copy)');
  p.removeEditors(p.getEditors());
  if (p.canDomainEdit()) p.setDomainEdit(false);

  // Runs as the owner whenever anyone (the supplier) edits the supplier file.
  ensureTrigger_('onSupplierEdit', () => ScriptApp.newTrigger('onSupplierEdit').forSpreadsheet(ss).onEdit().create());
  syncSupplierSheet();
  console.log('Supplier file: ' + ss.getUrl() + '  (Share → the supplier\'s Gmail as Editor. Never share the Orders file.)');
  return ss.getUrl();
}

// Adds "Send to supplier" (checkbox) and the two columns the supplier's updates come back into, at the end
// of the Orders tab (the script finds them by name).
function ensureSupplierColumn_(sheet) {
  const header = ensureHeaders_(sheet, [SUPPLIER_COL_HEADER].concat(SUPPLIER_BACK_HEADERS), null);
  const c = findCol(header, [SUPPLIER_COL_HEADER]) + 1;
  sheet.getRange(2, c, sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sheet.setColumnWidth(c, 110);
  SUPPLIER_BACK_HEADERS.forEach((h, i) => {
    const b = findCol(header, [h]) + 1;
    sheet.setColumnWidth(b, i ? 220 : 110);
    sheet.getRange(2, b, sheet.getMaxRows() - 1, 1).setNumberFormat('@').setWrap(true);
    protectOnce_(sheet, sheet.getRange(1, b, sheet.getMaxRows(), 1), PROTECT_TAG + ' (' + h + ')');
  });
}

// Installable trigger on the supplier file (made by setupSupplierFile).
function onSupplierEdit() {
  syncSupplierSafely_();
}

function syncSupplierSheet() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 'busy'; // the 5-minute timer will try again
  try {
    return syncSupplierSheetLocked_();
  } finally {
    lock.releaseLock();
  }
}

// Never lets a supplier-sheet problem break order handling.
function syncSupplierSafely_() {
  try {
    syncSupplierSheet();
  } catch (err) {
    console.error('Supplier sheet sync failed: ' + err);
  }
}

function syncSupplierSheetLocked_() {
  const id = prop_('SUPPLIER_SHEET_ID');
  if (!id) return 'no supplier file';
  const ordersSheet = ordersSheet_();
  const values = ordersSheet.getDataRange().getValues();
  const col = orderColumns_(values[0]);
  const tickCol = findCol(values[0], [SUPPLIER_COL_HEADER]);
  if (tickCol < 0) return 'no "' + SUPPLIER_COL_HEADER + '" column';

  const sheet = findSheet_(SpreadsheetApp.openById(id), SUPPLIER_TAB);
  if (!sheet) throw new Error('The supplier file has no ' + SUPPLIER_TAB + ' tab. Run setupSupplierFile.');
  const n = SUPPLIER_HEADERS.length;
  const current = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), n + SUPPLIER_OWN_HEADERS.length).getValues();
  const rowOf = new Map();
  let last = 1;
  for (let r = 1; r < current.length; r++) {
    const oid = unguardText(text(current[r][0]));
    if (oid) {
      rowOf.set(oid, r + 1);
      last = r + 1;
    }
  }

  const append = [];
  let changed = 0;
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const oid = unguardText(text(row[col.orderId]));
    if (!oid) continue;
    const ship = row[tickCol] === true && normKey(row[col.status]) !== 'cancelled';
    const at = rowOf.get(oid);
    if (ship) {
      const want = supplierRow_(row, col);
      if (!at) append.push(want);
      else if (supplierKey_(current[at - 1]) !== supplierKey_(want)) {
        sheet.getRange(at, 1, 1, n).setValues([want]);
        changed++;
      }
    } else if (at && text(current[at - 1][2]) !== SUPPLIER_DONT_SHIP) {
      sheet.getRange(at, 3).setValue(SUPPLIER_DONT_SHIP);
      changed++;
    }
  }
  if (append.length) {
    if (last + append.length > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), append.length + 100);
    sheet.getRange(last + 1, 1, append.length, n).setValues(append);
  }
  const back = copySupplierUpdatesBack_(ordersSheet, values, col, current, n);
  return append.length + ' sent, ' + changed + ' updated, ' + back + ' supplier update(s) copied back';
}

// Only delivery details - no prices, totals or payment.
function supplierRow_(row, col) {
  const t = (f) => unguardText(text(row[col[f]]));
  let lines = [];
  try {
    lines = JSON.parse(t('itemsJson') || '[]');
  } catch (err) {
    lines = [];
  }
  const items = lines.map((l) => l.qty + ' × ' + [l.brand + ' ' + l.name, l.size, l.flavour].filter(Boolean).join(' – ')).join('\n');
  const pickup = /pickup/i.test(t('fulfilment'));
  const out = [
    t('orderId'),
    row[col.created] instanceof Date ? row[col.created] : '',
    SUPPLIER_SHIP,
    items,
    t('name'),
    t('phone'),
    pickup ? 'Store pickup – send to the shop' : t('address'),
    pickup ? '' : t('landmark'),
    pickup ? '' : t('area'),
    pickup ? '' : t('pincode'),
    t('notes'),
  ];
  return out.map((v) => (typeof v === 'string' ? guardText(v) : v));
}

// The supplier's Shipped tick and Tracking / note -> the Orders tab. Only changed cells are written.
function copySupplierUpdatesBack_(ordersSheet, values, col, current, n) {
  const backCols = SUPPLIER_BACK_HEADERS.map((h) => findCol(values[0], [h]));
  if (backCols.some((c) => c < 0)) return 0; // columns not added yet - run setupOrdersFile
  const fromSupplier = new Map();
  for (let r = 1; r < current.length; r++) {
    const oid = unguardText(text(current[r][0]));
    if (!oid) continue;
    const shipped = current[r][n] === true ? 'Shipped' : '';
    fromSupplier.set(oid, [shipped, guardText(text(current[r][n + 1]).slice(0, 500))]);
  }
  let count = 0;
  for (let r = 1; r < values.length; r++) {
    const got = fromSupplier.get(unguardText(text(values[r][col.orderId])));
    if (!got) continue;
    backCols.forEach((c, i) => {
      if (unguardText(text(values[r][c])) !== unguardText(got[i])) {
        ordersSheet.getRange(r + 1, c + 1).setValue(got[i]);
        count++;
      }
    });
  }
  return count;
}

function supplierKey_(row) {
  return JSON.stringify(row.slice(0, SUPPLIER_HEADERS.length).map((v) => (v instanceof Date ? v.getTime() : unguardText(text(v)))));
}
