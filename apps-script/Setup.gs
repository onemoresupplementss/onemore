/**
 * Setup.gs - things the owner runs once (all are safe to run again; they never delete data).
 *
 *   setupAll            = setupKeys + setupProductsFile + setupOrdersFile + selfTest
 *   setupKeys           creates API_KEY and REFRESH_KEY (only if missing) and prints them in the log
 *   setupProductsFile   creates/repairs the "oneMore Products" spreadsheet, fills empty tabs from SEED
 *   setupOrdersFile     creates/repairs the Orders tab, report tabs and all timers
 *   setWebsiteAddresses asks for SITE_URL and DEPLOY_HOOK_URL (or set them in Project Settings →
 *                       Script Properties)
 *   selfTest            checks everything and prints OK / PROBLEM lines (View → Logs / Execution log)
 */

const PRODUCT_HEADERS = ['ID', 'Group', 'Active', 'Verified', 'Brand', 'Name', 'Category', 'Size', 'Flavour', 'Price', 'MRP',
  'Stock', 'Image', 'Description', 'NetQty', 'Unit', 'BestBefore', 'Bestseller', 'Badge', 'Sort', 'Keywords', 'Check'];
const INFO_HEADERS = ['Group', 'GenericName', 'VegNonVeg', 'Ingredients', 'Nutrition', 'Warnings', 'Manufacturer', 'Importer',
  'CountryOfOrigin', 'ConsumerCare', 'LabelImages', 'Imported'];
const SETTINGS_HEADERS = ['Setting', 'Value', 'Notes'];
const DELIVERY_HEADERS = ['Area', 'Pincodes', 'Fee', 'ETA', 'Active'];
const PROTECT_TAG = 'oneMore: written by the script';

/* =====================================================================
 * Menu
 * ===================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('oneMore')
    .addItem('Push stock to website now', 'menuPushNow')
    .addItem('Check products', 'menuCheckProducts')
    .addItem('Rebuild website now', 'rebuildWebsite')
    .addSeparator()
    .addItem('Run self-test', 'menuSelfTest')
    .addItem('Set website address…', 'setWebsiteAddresses')
    .addItem('Set up / repair (safe to re-run)', 'setupAll')
    .addToUi();
}

function menuPushNow() {
  const out = pushLiveFeed('manual');
  say_('Push stock to website', out.status || (out.ok ? 'OK' : 'Failed'));
}

function menuCheckProducts() {
  const n = checkProducts();
  say_('Check products', n ? n + ' active product rows need attention. See the Check column in the Products file.' : 'All product rows look OK.');
}

function menuSelfTest() {
  say_('Self-test', selfTest());
}

// Shows a message box when the spreadsheet is open; otherwise just writes to the log.
function say_(title, message) {
  console.log(title + ': ' + message);
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (err) {
    // run from the editor or a timer - the log is enough
  }
}

/* =====================================================================
 * Everything at once
 * ===================================================================== */

function setupAll() {
  setupKeys();
  setupProductsFile();
  setupOrdersFile();
  const report = selfTest();
  say_('oneMore setup finished', report);
}

/* =====================================================================
 * Keys and addresses
 * ===================================================================== */

function setupKeys() {
  const props = PropertiesService.getScriptProperties();
  const make = () => (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  ['API_KEY', 'REFRESH_KEY'].forEach((k) => {
    if (!props.getProperty(k)) props.setProperty(k, make());
  });
  console.log('Copy these into Cloudflare Pages → Settings → Variables and secrets (as Secrets):');
  console.log('  APPS_SCRIPT_KEY = ' + props.getProperty('API_KEY'));
  console.log('  REFRESH_KEY     = ' + props.getProperty('REFRESH_KEY'));
  console.log('Existing keys are never changed. To make a new one, delete it in Project Settings → Script Properties and run setupKeys again.');
}

// Asks for the website address and the deploy hook. Leave a box empty to keep the current value.
function setWebsiteAddresses() {
  let ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (err) {
    console.log('Open the Orders spreadsheet and use menu oneMore → Set website address…, or set SITE_URL and ' +
      'DEPLOY_HOOK_URL in Project Settings (⚙) → Script Properties.');
    return;
  }
  const props = PropertiesService.getScriptProperties();
  const ask = (key, question) => {
    const res = ui.prompt(key, question + '\nNow: ' + (props.getProperty(key) || '(not set)') + '\nLeave empty to keep it.', ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    const v = res.getResponseText().trim().replace(/\/+$/, '');
    if (!v) return;
    if (!/^https:\/\/[^\s]+$/.test(v)) {
      ui.alert('That does not look like a web address starting with https:// – not saved.');
      return;
    }
    props.setProperty(key, v);
  };
  ask('SITE_URL', 'Website address, e.g. https://onemore.example.in');
  ask('DEPLOY_HOOK_URL', 'Cloudflare Pages deploy hook URL (Pages project → Settings → Builds → Deploy hooks)');
}

/* =====================================================================
 * Products file
 * ===================================================================== */

function setupProductsFile() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  const id = props.getProperty('PRODUCTS_SHEET_ID');
  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (err) {
      throw new Error('PRODUCTS_SHEET_ID is set but that file cannot be opened (' + err.message + '). Fix or delete the property.');
    }
  } else {
    ss = SpreadsheetApp.create('oneMore Products');
    props.setProperty('PRODUCTS_SHEET_ID', ss.getId());
  }
  ss.setSpreadsheetTimeZone(TZ);

  setupProductsTab_(ss);
  setupInfoTab_(ss);
  setupSettingsTab_(ss);
  setupDeliveryTab_(ss);
  priceLogSheet_(ss);
  removeEmptyDefaultSheet_(ss);
  try {
    ss.setActiveSheet(findSheet_(ss, 'Products'));
    ss.moveActiveSheet(1);
  } catch (err) {
    // tab order is only cosmetic
  }

  ensureTrigger_('onProductsEdit', () => ScriptApp.newTrigger('onProductsEdit').forSpreadsheet(ss).onEdit().create());
  SpreadsheetApp.flush();
  checkProducts_(readProductsFile_(ss, { info: true }));
  console.log('Products file: ' + ss.getUrl() + '  (share it with staff as Editor; keep the Orders file private)');
  return ss.getUrl();
}

function setupProductsTab_(ss) {
  const sheet = findSheet_(ss, 'Products') || ss.insertSheet('Products');
  const header = ensureHeaders_(sheet, PRODUCT_HEADERS, PRODUCT_COLUMNS);
  styleHeader_(sheet, header.length);
  ensureRows_(sheet, 500);
  const rows = sheet.getMaxRows() - 1;
  const c = (field) => findCol(header, field === 'check' ? CHECK_COLUMN : PRODUCT_COLUMNS[field]) + 1;
  const colRange = (field) => sheet.getRange(2, c(field), rows, 1);

  ['id', 'group', 'size', 'flavour', 'image', 'description', 'badge', 'keywords', 'unit'].forEach((f) => colRange(f).setNumberFormat('@'));
  ['price', 'mrp'].forEach((f) => colRange(f).setNumberFormat(MONEY_FORMAT));
  ['stock', 'sort'].forEach((f) => colRange(f).setNumberFormat('0'));
  colRange('bestBefore').setNumberFormat('yyyy-mm-dd');
  const checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  ['active', 'verified', 'bestseller'].forEach((f) => colRange(f).setDataValidation(checkbox));
  colRange('category').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(CATEGORIES.map((x) => x.name), true).setAllowInvalid(false).build());
  colRange('unit').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(UNITS, true).setAllowInvalid(false).build());
  colRange('bestBefore').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true)
    .setHelpText('Date of the earliest batch on the shelf, e.g. 2027-03-31').build());
  colRange('check').setFontColor('#b3261e').setWrap(true);
  sheet.setColumnWidth(c('name'), 220);
  sheet.setColumnWidth(c('description'), 220);
  sheet.setColumnWidth(c('check'), 360);

  // Fill from SEED only when the tab has no products yet. (Not getLastRow(): the checkbox
  // columns count as filled all the way down, so the tab never looks empty.)
  if (!hasEntries_(sheet, c('id')) && typeof SEED !== 'undefined' && SEED.products.length) {
    const values = SEED.products.map((p) => header.map((h) => (normKey(h) === 'check' ? '' : seedValue_(p, h, PRODUCT_COLUMNS))));
    sheet.getRange(2, 1, values.length, header.length).setValues(values);
    // The seed's to-do notes go into cell notes so the Check column can be rewritten by the script.
    sheet.getRange(2, c('check'), values.length, 1).setNotes(SEED.products.map((p) => [p.Check ? 'Setup to-do: ' + p.Check : '']));
  }
  protectOnce_(sheet, sheet.getRange(1, c('check'), sheet.getMaxRows(), 1), PROTECT_TAG + ' (Check column)');
}

function setupInfoTab_(ss) {
  const sheet = findSheet_(ss, 'Product info') || ss.insertSheet('Product info');
  const header = ensureHeaders_(sheet, INFO_HEADERS, INFO_COLUMNS);
  styleHeader_(sheet, header.length);
  sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), header.length).setNumberFormat('@').setWrap(true);
  if (sheet.getLastRow() <= 1 && typeof SEED !== 'undefined' && SEED.info.length) {
    const values = SEED.info.map((p) => header.map((h) => seedValue_(p, h, INFO_COLUMNS)));
    sheet.getRange(2, 1, values.length, header.length).setValues(values);
  }
  for (let i = 1; i <= header.length; i++) sheet.setColumnWidth(i, 180);
}

function setupSettingsTab_(ss) {
  const sheet = findSheet_(ss, 'Settings') || ss.insertSheet('Settings');
  const header = ensureHeaders_(sheet, SETTINGS_HEADERS, null);
  styleHeader_(sheet, header.length);
  const cols = settingsCols_(header);
  const notesCol = findCol(header, ['notes']);
  let values = sheet.getDataRange().getValues();

  // Add any setting rows that are missing (all of them on a new file). Existing values are kept.
  const seedRows = typeof SEED !== 'undefined' ? SEED.settingsRows : [];
  const missing = seedRows.filter((r) => !settingsRowOf_(values, r[0]));
  if (missing.length) {
    const start = values.length + 1;
    const width = header.length;
    const range = sheet.getRange(start, 1, missing.length, width);
    const formats = range.getNumberFormats();
    const block = missing.map((r, i) => {
      const row = new Array(width).fill('');
      row[cols.keyCol] = r[0];
      row[cols.valueCol] = r[1];
      if (notesCol >= 0) row[notesCol] = r[2];
      const spec = SETTINGS[r[0]];
      if ((spec && spec[0] === 'text') || r[0] === 'SiteStatus') formats[i][cols.valueCol] = '@'; // keeps "18:00" as text
      return row;
    });
    range.setNumberFormats(formats);
    range.setValues(block);
    values = sheet.getDataRange().getValues();
  }

  // Dropdowns and checkboxes in the Value column.
  const yesNo = SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).setAllowInvalid(true).build();
  const openClosed = SpreadsheetApp.newDataValidation().requireValueInList(['Open', 'Closed'], true).setAllowInvalid(false).build();
  Object.keys(SETTINGS).forEach((key) => {
    const row = settingsRowOf_(values, key);
    if (!row) return;
    const cell = sheet.getRange(row, cols.valueCol + 1);
    if (SETTINGS[key][0] === 'bool') cell.setDataValidation(yesNo);
    if (SETTINGS[key][0] === 'choice') cell.setDataValidation(openClosed);
  });
  const publishRow = settingsRowOf_(values, 'PublishNow');
  if (publishRow) {
    const cell = sheet.getRange(publishRow, cols.valueCol + 1);
    cell.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    if (typeof values[publishRow - 1][cols.valueCol] !== 'boolean') cell.setValue(false);
  }
  const statusRow = settingsRowOf_(values, 'SiteStatus');
  if (statusRow) protectOnce_(sheet, sheet.getRange(statusRow, cols.valueCol + 1), PROTECT_TAG + ' (SiteStatus)');
  sheet.setColumnWidth(cols.keyCol + 1, 190);
  sheet.setColumnWidth(cols.valueCol + 1, 320);
  if (notesCol >= 0) sheet.setColumnWidth(notesCol + 1, 480);
  sheet.getRange(1, 1, sheet.getMaxRows(), header.length).setWrap(true);
}

function setupDeliveryTab_(ss) {
  const sheet = findSheet_(ss, 'Delivery') || ss.insertSheet('Delivery');
  const header = ensureHeaders_(sheet, DELIVERY_HEADERS, DELIVERY_COLUMNS);
  styleHeader_(sheet, header.length);
  const rows = Math.max(1, sheet.getMaxRows() - 1);
  const c = (field) => findCol(header, DELIVERY_COLUMNS[field]) + 1;
  sheet.getRange(2, c('area'), rows, 1).setNumberFormat('@');
  sheet.getRange(2, c('pincodes'), rows, 1).setNumberFormat('@');
  sheet.getRange(2, c('eta'), rows, 1).setNumberFormat('@');
  sheet.getRange(2, c('fee'), rows, 1).setNumberFormat(MONEY_FORMAT);
  sheet.getRange(2, c('active'), rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  if (!hasEntries_(sheet, c('area')) && typeof SEED !== 'undefined' && SEED.delivery.length) {
    const values = SEED.delivery.map((d) => header.map((h) => seedValue_(d, h, DELIVERY_COLUMNS)));
    sheet.getRange(2, 1, values.length, header.length).setValues(values);
  }
  sheet.setColumnWidth(c('area'), 240);
  sheet.setColumnWidth(c('pincodes'), 260);
  sheet.setColumnWidth(c('eta'), 220);
}

/* =====================================================================
 * Orders file (this spreadsheet)
 * ===================================================================== */

function setupOrdersFile() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Run setupOrdersFile from the Apps Script that belongs to the Orders spreadsheet.');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('ORDERS_SHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(TZ);

  const sheet = findSheet_(ss, ORDERS_TAB) || ss.insertSheet(ORDERS_TAB, 0);
  const header = ensureHeaders_(sheet, ORDER_HEADERS, null);
  const col = orderColumns_(header);
  styleHeader_(sheet, header.length);
  ensureRows_(sheet, 2000);
  const rows = sheet.getMaxRows() - 1;
  const colRange = (field) => sheet.getRange(2, col[field] + 1, rows, 1);

  ORDER_TEXT_FIELDS.forEach((f) => colRange(f).setNumberFormat('@'));
  ['created', 'updated'].forEach((f) => colRange(f).setNumberFormat(DATE_TIME_FORMAT));
  ['total', 'subtotal', 'deliveryFee'].forEach((f) => colRange(f).setNumberFormat(MONEY_FORMAT));
  colRange('status').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  colRange('payment').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PAYMENTS, true).setAllowInvalid(false).build());
  colRange('method').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(METHOD_LABELS).map((k) => METHOD_LABELS[k]), true).setAllowInvalid(true).build());
  colRange('stockHeld').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  ['items', 'address', 'notes', 'utrFlag'].forEach((f) => colRange(f).setWrap(true));

  const widths = { orderId: 90, created: 150, status: 120, payment: 90, method: 120, total: 80, name: 150, phone: 110,
    fulfilment: 90, area: 160, pincode: 70, address: 240, landmark: 160, items: 380, subtotal: 80, deliveryFee: 80,
    notes: 200, utr: 120, utrFlag: 220, source: 60, stockHeld: 80, updated: 150, itemsJson: 120, idemKey: 120 };
  Object.keys(widths).forEach((f) => sheet.setColumnWidth(col[f] + 1, widths[f]));

  // Colours: Cancelled = grey row, UTR flag = red, CALL FIRST = red, stale (New + Pending > 2 h) = orange row,
  // Paid = green, New = yellow.
  const L = (f) => colLetter_(col[f] + 1);
  const last = colLetter_(header.length);
  const all = sheet.getRange('A2:' + last + sheet.getMaxRows());
  const one = (f) => sheet.getRange(L(f) + '2:' + L(f) + sheet.getMaxRows());
  const rule = () => SpreadsheetApp.newConditionalFormatRule();
  sheet.setConditionalFormatRules([
    rule().whenFormulaSatisfied('=$' + L('status') + '2="Cancelled"').setBackground('#e0e0e0').setFontColor('#757575').setRanges([all]).build(),
    rule().whenFormulaSatisfied('=LEN($' + L('utrFlag') + '2)>0').setBackground('#fce8e6').setFontColor('#b3261e').setRanges([one('utrFlag')]).build(),
    rule().whenTextContains(CALL_FIRST_MARK).setFontColor('#b3261e').setBold(true).setRanges([one('items')]).build(),
    rule().whenFormulaSatisfied('=AND($' + L('status') + '2="New",$' + L('payment') + '2="Pending",ISNUMBER($' + L('created') +
      '2),NOW()-$' + L('created') + '2>' + STALE_HOURS + '/24)').setBackground('#ffd8a8').setRanges([all]).build(),
    rule().whenTextEqualTo('Paid').setBackground('#c8e6c9').setRanges([one('payment')]).build(),
    rule().whenTextEqualTo('New').setBackground('#fff59d').setRanges([one('status')]).build(),
  ]);

  // Script-only columns: hidden and protected with a warning.
  sheet.hideColumns(col.itemsJson + 1);
  sheet.hideColumns(col.idemKey + 1);
  ['itemsJson', 'idemKey', 'stockHeld'].forEach((f) => protectOnce_(sheet, sheet.getRange(1, col[f] + 1, sheet.getMaxRows(), 1), PROTECT_TAG + ' (' + f + ')'));

  // Report tabs (formulas only - safe to rebuild).
  const src = "'" + sheet.getName() + "'!A:" + last;
  const q = (query) => '=QUERY(' + src + ', "' + query + '", 1)';
  formulaTab_(ss, 'Pending payments', q('select ' + ['orderId', 'created', 'name', 'phone', 'method', 'total', 'utr', 'utrFlag'].map(L).join(', ') +
    ' where ' + L('payment') + " = 'Pending' and " + L('status') + " <> 'Cancelled' and " + L('orderId') + " <> '' order by " + L('created') + ' desc'));
  formulaTab_(ss, 'To pack', q('select ' + ['orderId', 'created', 'fulfilment', 'name', 'phone', 'area', 'pincode', 'address', 'landmark', 'items',
    'total', 'method', 'payment', 'notes'].map(L).join(', ') + ' where ' + L('status') + " = 'New' and (" + L('payment') + " = 'Paid' or " +
    L('method') + " <> 'UPI') order by " + L('created') + ' asc'));
  formulaTab_(ss, 'Today', '=QUERY(' + src + ', "select ' + ['orderId', 'created', 'status', 'payment', 'method', 'total', 'name', 'phone',
    'fulfilment', 'area', 'items'].map(L).join(', ') + ' where ' + L('created') + " >= datetime '\"&TEXT(TODAY(),\"yyyy-mm-dd\")&\" 00:00:00' order by " +
    L('created') + ' desc", 1)');
  formulaTab_(ss, 'Customers', q('select ' + L('phone') + ', max(' + L('name') + '), count(' + L('orderId') + '), sum(' + L('total') + '), max(' +
    L('created') + ') where ' + L('orderId') + " <> '' and " + L('status') + " <> 'Cancelled' group by " + L('phone') + ' order by max(' +
    L('created') + ') desc label ' + L('phone') + " 'Phone', max(" + L('name') + ") 'Name', count(" + L('orderId') + ") 'Orders', sum(" +
    L('total') + ") 'Total spent', max(" + L('created') + ") 'Last order' format sum(" + L('total') + ") '#,##0', max(" + L('created') +
    ") 'd mmm yyyy'"));

  removeEmptyDefaultSheet_(ss);
  if (!props.getProperty('ORDER_SEQ')) props.setProperty('ORDER_SEQ', '1000');

  ensureTrigger_('onOrdersEdit', () => ScriptApp.newTrigger('onOrdersEdit').forSpreadsheet(ss).onEdit().create());
  ensureTrigger_('timerTick', () => ScriptApp.newTrigger('timerTick').timeBased().everyMinutes(5).create());
  ensureTrigger_('staleOrderReminder', () => ScriptApp.newTrigger('staleOrderReminder').timeBased().everyMinutes(30).create());
  ensureTrigger_('dailyRebuild', () => ScriptApp.newTrigger('dailyRebuild').timeBased().atHour(5).everyDays(1).inTimezone(TZ).create());
  console.log('Orders file ready: ' + ss.getUrl());
}

function formulaTab_(ss, name, formula) {
  const sheet = findSheet_(ss, name) || ss.insertSheet(name);
  sheet.getRange('A1').setFormula(formula);
  sheet.setFrozenRows(1);
  sheet.getRange('1:1').setFontWeight('bold');
}

/* =====================================================================
 * Self-test
 * ===================================================================== */

function selfTest() {
  const lines = [];
  const ok = (m) => lines.push('OK       ' + m);
  const bad = (m) => lines.push('PROBLEM  ' + m);
  const note = (m) => lines.push('NOTE     ' + m);
  const props = PropertiesService.getScriptProperties();
  const p = (k) => props.getProperty(k) || '';

  // Script Properties
  p('API_KEY').length >= 32 ? ok('API_KEY is set') : bad('API_KEY missing - run setupKeys');
  p('REFRESH_KEY').length >= 32 ? ok('REFRESH_KEY is set') : bad('REFRESH_KEY missing - run setupKeys');
  if (!p('SITE_URL')) bad('SITE_URL missing - menu oneMore → Set website address…');
  else if (!/^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(p('SITE_URL')) || /\/$/.test(p('SITE_URL'))) bad('SITE_URL should look like https://onemore.example.in (no slash at the end): ' + p('SITE_URL'));
  else ok('SITE_URL = ' + p('SITE_URL'));
  p('DEPLOY_HOOK_URL') ? ok('DEPLOY_HOOK_URL is set') : note('DEPLOY_HOOK_URL not set - "Rebuild website" and the daily rebuild will not work');
  /^\d+$/.test(p('ORDER_SEQ')) ? ok('ORDER_SEQ = ' + p('ORDER_SEQ') + ' (next order ORD-' + (Number(p('ORDER_SEQ')) + 1) + ')') : bad('ORDER_SEQ missing - run setupOrdersFile');

  // Orders file
  try {
    const sheet = ordersSheet_();
    orderColumns_(sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0]);
    ok('Orders tab has all columns (' + Math.max(0, sheet.getLastRow() - 1) + ' orders)');
    ['Pending payments', 'To pack', 'Today', 'Customers'].forEach((t) => (findSheet_(sheet.getParent(), t) ? ok('Tab "' + t + '"') : bad('Tab "' + t + '" missing - run setupOrdersFile')));
  } catch (err) {
    bad(err.message);
  }

  // Products file
  let data = null;
  try {
    data = readProductsFile_(productsSpreadsheet_(), { info: true });
    ok('Products file opens: ' + data.ss.getUrl());
  } catch (err) {
    bad('Products file: ' + err.message);
  }
  if (data) {
    const header = data.products.values[0];
    const needed = ['id', 'active', 'verified', 'brand', 'name', 'category', 'size', 'flavour', 'price', 'mrp', 'stock', 'image', 'netQty', 'unit', 'bestBefore'];
    const missing = needed.filter((f) => findCol(header, PRODUCT_COLUMNS[f]) < 0);
    missing.length ? bad('Products tab is missing column(s): ' + missing.join(', ')) : ok('Products tab columns');
    findCol(header, CHECK_COLUMN) >= 0 ? ok('Check column present') : bad('Check column missing - run setupProductsFile');
    data.info.sheet ? ok('Product info tab') : bad('Product info tab missing');
    data.delivery.sheet ? ok('Delivery tab') : note('Delivery tab missing - every area pays Settings DeliveryFee');
    findSheet_(data.ss, 'Price log') ? ok('Price log tab') : note('Price log tab will be created on the first push');
    ['PublishNow', 'SiteStatus'].forEach((k) => (settingsRowOf_(data.settings.values, k) ? ok('Settings row ' + k) : bad('Settings row ' + k + ' missing - run setupProductsFile')));

    const s = normalizeSettings(settingsMap_(data.settings.values));
    s.AcceptingOrders === 'Open' ? ok('AcceptingOrders = Open') : note('AcceptingOrders = Closed (no online orders)');
    s.AlertEmail ? ok('AlertEmail = ' + s.AlertEmail) : note('AlertEmail blank - no order emails or stale reminders');
    if (s.MaxOpenOrdersPerPhone < 1) bad('MaxOpenOrdersPerPhone is ' + s.MaxOpenOrdersPerPhone + ' - this blocks every order');
    if (s.MaxQtyPerLine < 1) bad('MaxQtyPerLine is ' + s.MaxQtyPerLine + ' - this blocks every order');
    if (s.PreviewBanner) note('PreviewBanner is on - set it to No at launch');

    try {
      const dry = pushLiveFeed('test', { data: data, dryRun: true });
      const ids = Object.keys(dry.feed.items);
      const visible = ids.filter((id) => dry.feed.items[id][3]).length;
      ok('Feed builds: ' + ids.length + ' variants, ' + visible + ' buyable online, ' + dry.feed.delivery.length + ' delivery areas, ' +
        JSON.stringify(dry.feed).length + ' bytes, v=' + dry.feed.v + (p('LAST_FEED_HASH') === dry.feed.v ? ' (website is up to date)' : ' (not yet on the website)'));
      if (!visible) note('No variant is buyable yet - tick Verified (RequireVerified is ' + (s.RequireVerified ? 'Yes' : 'No') + ') and check prices/BestBefore');
      if (dry.model.warnings.length) note('Rows skipped by the website: ' + dry.model.warnings.slice(0, 5).join(' | ') + (dry.model.warnings.length > 5 ? ' …' : ''));
      const checks = productChecks({ products: rowsAsObjects_(data.products.values), info: rowsAsObjects_(data.info.values), settings: settingsMap_(data.settings.values) }, todayIST());
      checks.problemRows ? note(checks.problemRows + ' active product rows have something in the Check column') : ok('Check column: all rows OK');
    } catch (err) {
      bad('Feed could not be built: ' + err.message);
    }
    if (p('STATUS_SYNC')) (p('STATUS_SYNC').indexOf('– OK') !== -1 ? ok : note)(p('STATUS_SYNC'));
  }

  // Triggers
  const have = ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  ['onOrdersEdit', 'onProductsEdit', 'timerTick', 'staleOrderReminder', 'dailyRebuild'].forEach((h) =>
    have.indexOf(h) !== -1 ? ok('Trigger ' + h) : bad('Trigger ' + h + ' missing - run setupAll'));

  try {
    ok('Emails left today: ' + MailApp.getRemainingDailyQuota());
  } catch (err) {
    note('Could not read the email quota: ' + err.message);
  }

  const report = lines.join('\n');
  console.log(report);
  return report;
}

/* =====================================================================
 * Small setup helpers
 * ===================================================================== */

// Field aliases for a header text (or just the header itself).
function aliasesFor_(header, aliasTable) {
  if (aliasTable) {
    const k = normKey(header);
    const fields = Object.keys(aliasTable);
    for (let i = 0; i < fields.length; i++) {
      if (aliasTable[fields[i]].some((a) => normKey(a) === k)) return aliasTable[fields[i]];
    }
  }
  if (normKey(header) === 'check') return CHECK_COLUMN;
  return [header];
}

// Writes the header row on an empty tab, or adds missing columns at the end. Never reorders.
function ensureHeaders_(sheet, headers, aliasTable) {
  const lastCol = sheet.getLastColumn();
  let current = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => text(h)) : [];
  if (!current.some(Boolean)) {
    if (headers.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return headers.slice();
  }
  const missing = headers.filter((h) => findCol(current, aliasesFor_(h, aliasTable)) < 0);
  if (missing.length) {
    const start = current.length + 1;
    const need = start + missing.length - 1 - sheet.getMaxColumns();
    if (need > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), need);
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    current = current.concat(missing);
  }
  return current;
}

function styleHeader_(sheet, width) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#f1f3f4');
}

// True when any row below the header has text in column `col` (1-based).
function hasEntries_(sheet, col) {
  if (sheet.getMaxRows() < 2) return false;
  return sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).getValues().some((r) => String(r[0]).trim() !== '');
}

function ensureRows_(sheet, n) {
  if (sheet.getMaxRows() < n) sheet.insertRowsAfter(sheet.getMaxRows(), n - sheet.getMaxRows());
}

// Value for a header from a SEED object (matching the header by name or alias).
function seedValue_(obj, header, aliasTable) {
  const aliases = aliasesFor_(header, aliasTable).map(normKey);
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    if (aliases.indexOf(normKey(keys[i])) !== -1) return obj[keys[i]];
  }
  return '';
}

// Warning-only protection (edits are allowed after a "are you sure?" message). Replaces an older one.
function protectOnce_(sheet, range, description) {
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach((p) => {
    if (p.getDescription() === description) p.remove();
  });
  range.protect().setDescription(description).setWarningOnly(true);
}

// Removes old triggers for the handler and makes a fresh one (so re-running never doubles them).
function ensureTrigger_(handler, create) {
  deleteTriggers_(handler);
  create();
}

function removeEmptyDefaultSheet_(ss) {
  ['Sheet1', 'Sheet 1'].forEach((name) => {
    const s = ss.getSheetByName(name);
    if (s && ss.getSheets().length > 1 && s.getLastRow() === 0 && s.getLastColumn() === 0) ss.deleteSheet(s);
  });
}

function colLetter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
