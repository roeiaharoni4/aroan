# CRM — הזמנות, משימות והתראות — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** לאפשר לרועי לרשום הזמנות בלי התוכן שלהן, לראות אילו לקוחות מאחרים ביחס לקצב ההזמנות שלהם, לנהל משימות (על לקוח וכלליות), ולקבל התראות במייל ובטלגרם.

**Architecture:** הכל בתוך סקריפט ה-CRM הקיים (`tools/google-apps-script-crm.gs`), שהוא עדיין היחיד שכותב לגיליון "CRM — אהרוני". הסקריפט מחשב את הקצב ואת האיחור ומחזיר אותם לעמוד, ולשונית שלישית בשם "משימות" מחזיקה את המשימות. טריגר זמן אחד (`tick`, כל 5 דקות) שולח תזכורות למשימות ואת סיכום הבוקר. פנייה חדשה שולחת טלגרם מיד מתוך `event`. העמוד (`crm-f428d7/`) מציג את הנתונים ושולח את הפעולות החדשות.

**Tech Stack:** Google Apps Script (V8), גוגל שיטס, Telegram Bot API דרך `UrlFetchApp`, ‏`MailApp`, ‏`PropertiesService`, ‏`ScriptApp`. העמוד: HTML/CSS/JS סטטי בלי framework. הבדיקות: Node, ברתמה הקיימת שטוענת את קובץ ה-`.gs` עצמו עם דמויות של שירותי גוגל.

**אפיון:** `docs/superpowers/specs/2026-11-03-crm-orders-tasks-notifications-design.md`

## Global Constraints

- **הריפו פומבי.** בקבצים שנכנסים ל-git אין סיסמה, סוד, טוקן או מזהה של גיליון CRM — רק מצייני מקום `PUT_..._HERE`.
- **Claude לא קורא ולא מדפיס את סיסמת הייצור, את הסוד המשותף או את טוקן הבוט.** ערכים עוברים מקובץ לקובץ בתוך סקריפט, והפלט מציג לכל היותר true/false.
- **טוקן הבוט נשמר רק ב-Script Properties** (`TELEGRAM_TOKEN`). רועי מדביק אותו בעצמו.
- **כל כתיבה לגיליון:** בפורמט טקסט (`'@'`), דרך `sanitize_`, ובתוך `withLock_`.
- **סקריפט הלידים וסקריפט ההזמנות לא משתנים.**
- **אין לידים, הזמנות או משימות בדיקה בייצור בלי אישור מפורש של רועי.**
- **סדר הפריסה מחייב:** קודם `push` ל-HEAD, אחר כך רועי מריץ `setupNotifications` ומאשר, ורק אז גרסה חדשה על הפריסה הקיימת `AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw`. ה-push של האתר בא אחרי הפריסה. בסדר אחר ה-Web app עוצר עד האישור.
- **קבועים מהאפיון:**
  - מיזוג הזמנות: עד **3** ימים.
  - קצב: חציון המרווחים, כשיש לפחות **3** ימי הזמנה.
  - סף איחור: `max(round(rhythm × 1.5), rhythm + 7)`, ובלי קצב — **45**.
  - סיכום בוקר: **07:30–12:00**, ראשון עד שישי, פעם ביום.
  - תזכורות: ניסיון חוזר עד **120** דקות; "(באיחור)" אחרי **30** דקות.
  - מייל: `meiraroam@gmail.com`. העמוד: `https://aroam.co.il/crm-f428d7/`.
- **עמוד:** עברית, בלי אימוג'ים, טוקנים קיימים ב-`crm.css`. בלי גלישה אופקית ב-375px, תקין במצב כהה ובמקלדת, ו"חזור" של הטלפון סוגר חלון.
- **גרסאות:** `crm-core.js?v=2`, ‏`crm.js?v=3`, ‏`crm.css?v=3`.
- **commit רק לקבצים של המשימה** (`git add <נתיבים>`, אף פעם לא `-A`) — סשן אחר עשוי לעבוד על הריפו במקביל. רועי דוחף בעצמו (GitHub Desktop).

## Contracts — ה-API אחרי השינוי

- **`list`** ⇒ `{ ok, today, contacts, activities, tasks }`:
  - **`contacts`:** השדות הקיימים (מחרוזות), ועוד:
    - `rhythm`: מספר, ‏0 = אין קצב.
    - `daysSinceOrder`: מספר, או `null` כשאין הזמנה.
    - `lateBy`: מספר.
    - `isLate`: בוליאני.
  - **`tasks`:** רק משימות פתוחות.
- **Task** — כל השדות מחרוזות: `{ id, contactId, text, due, time, done, created, reminded }`.
- **`order`** `{ id, order: { date?, note? } }` ⇒ `{ ok, contact, activity }`. שגיאות: `not found`, ‏`bad date`.
- **`order_cancel`** `{ activityId }` ⇒ `{ ok, contact }`. שגיאות: `not found`, ‏`not cancellable`.
- **`log`** מקבל גם `activity.type: 'הזמנה'` — זו התוצאה "הזמין". המונה מחושב מחדש.
- **`task_add`** `{ task: { text, due, time?, contactId? } }` ⇒ `{ ok, task }`. שגיאות: `text required`, ‏`bad date`, ‏`bad time`, ‏`not found`.
- **`task_update`** `{ id, fields: { text?, due?, time?, done?: true|false } }` ⇒ `{ ok, task, contact?, activity?, removedActivityId? }`.
- **`task_delete`** `{ id }` ⇒ `{ ok }`.
- **`event`** (עם הסוד): כמו היום. אחרי `lead`/`quote_request` הסקריפט שולח טלגרם; התשובה לא משתנה.
- **Script Properties:**
  - `TELEGRAM_TOKEN` — רועי מדביק.
  - `TELEGRAM_CHAT_ID` — `setupNotifications` שומרת.
  - `LAST_DIGEST` — `tick` שומר.
- **פונקציות ציבוריות:**
  - `tick` — הטריגר.
  - `setupNotifications` — הרצה ידנית מהעורך.

## מבנה הקבצים

| קובץ | מה משתנה |
|---|---|
| `tools/google-apps-script-crm.gs` | קצב ואיחור, רישום וביטול הזמנה, חיבור להזמנה מאותו יום, משימות, טלגרם, סיכום בוקר, `tick`, ‏`setupNotifications` |
| `tools/test/crm.test.js` | דמויות לשירותים החדשים, ובדיקות לכל הנ"ל |
| `crm-f428d7/crm-core.js` | סינונים "משימות" ו"לא הזמינו", מונים, תוויות הזמנה, משימות, "הזמין" כהזמנה |
| `tools/test/crm-page.test.js` | בדיקות ל-crm-core |
| `crm-f428d7/index.html`, `crm.js`, `crm.css` | כפתור "+ משימה", משימות ב"לטיפול", שורת הזמנות בכרטיס, חלונות "רישום הזמנה" ו"משימה", ‏"בטל" בהודעה |
| `tools/test/crm-fake-api.js` | השרת המדומה לבדיקה בדפדפן מקבל את הפעולות החדשות |
| `privacy/index.html` | טלגרם ברשימת הנמענים |
| `CLAUDE.md` | סבב 86 וגרסאות |
| `~/.aroam-crm/build-crm-from-cloud.js` (מחוץ לריפו) | בונה את עותק הענן עם הערכים מהעותק הפרוס |

---

### Task 1: הזמנות וקצב בסקריפט ה-CRM

**Files:**
- Modify: `tools/google-apps-script-crm.gs`
- Test: `tools/test/crm.test.js`

**Interfaces:**
- Produces:
  - `daysBetween_(a, b)` → מספר.
  - `orderDaysByContact_(activities)` → `{ contactId: ['YYYY-MM-DD', …] }`.
  - `orderEvents_(days)` → מערך.
  - `rhythmFor_(events)` → מספר.
  - `lateInfo_(c, days, today)` → `{ rhythm, daysSinceOrder, lateBy, isLate }`.
  - `recomputeOrders_(model, c)`.
  - `contactOut_(c, byContact, today)`.
  - פעולות API: `order`, ‏`order_cancel`, ו-`log` מסוג "הזמנה".
  - `applyEvent_` מחזיר `attached: true` כשהזמנה התחברה לרישום ידני.
  - `save_` כותב במקומה כל פעולה שסומנה `_dirty`.

- [ ] **Step 1: לכתוב את הבדיקות (נכשלות)**

ב-`tools/test/crm.test.js`, בפונקציה `loadGs()`, להחליף את שורת ה-`return` כך שתייצא גם את הפונקציות החדשות:

```js
  return new Function(stubs + src +
    '; return { normalizePhone_: normalizePhone_, sanitize_: sanitize_,' +
    '   findContact_: findContact_, applyEvent_: applyEvent_,' +
    '   classifyOrderRow_: classifyOrderRow_, buildImport_: buildImport_,' +
    '   orderRowsFromValues_: orderRowsFromValues_, daysBetween_: daysBetween_,' +
    '   orderDaysByContact_: orderDaysByContact_, orderEvents_: orderEvents_,' +
    '   rhythmFor_: rhythmFor_, lateInfo_: lateInfo_, recomputeOrders_: recomputeOrders_ };')();
```

לפני השורה `// ---------- ייבוא ----------`, להוסיף:

```js
// ---------- הזמנות וקצב ----------

test('קצב: הזמנות במרחק עד 3 ימים מתמזגות; פחות משלוש — בלי קצב', () => {
  assert.deepStrictEqual(gs.orderEvents_(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-20']),
    ['2026-10-05', '2026-10-20']);
  assert.strictEqual(gs.rhythmFor_(['2026-09-01', '2026-10-01']), 0);
  assert.strictEqual(gs.daysBetween_('2026-09-30', '2026-11-21'), 52);
});

test('קצב: חציון המרווחים בין ההזמנות', () => {
  assert.strictEqual(gs.rhythmFor_(['2026-07-01', '2026-08-01', '2026-08-29', '2026-10-01']), 31);
  assert.strictEqual(gs.rhythmFor_(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-29']), 7);
});

test('איחור: דוגמאות האפיון — חודשי, בלי קצב, שבועי, כל חודשיים', () => {
  const cust = { stage: 'לקוח', followUp: '' };
  assert.deepStrictEqual(gs.lateInfo_(cust, ['2026-08-01', '2026-08-31', '2026-09-30'], '2026-11-21'),
    { rhythm: 30, daysSinceOrder: 52, lateBy: 22, isLate: true });
  assert.deepStrictEqual(gs.lateInfo_(cust, ['2026-09-30'], '2026-11-21'),
    { rhythm: 0, daysSinceOrder: 52, lateBy: 7, isLate: true });
  assert.deepStrictEqual(gs.lateInfo_(cust, ['2026-09-01', '2026-09-08', '2026-09-15'], '2026-11-06'),
    { rhythm: 7, daysSinceOrder: 52, lateBy: 45, isLate: true });
  const bimonthly = gs.lateInfo_(cust, ['2026-05-03', '2026-07-02', '2026-08-31'], '2026-10-22');
  assert.strictEqual(bimonthly.rhythm, 60);
  assert.strictEqual(bimonthly.daysSinceOrder, 52);
  assert.strictEqual(bimonthly.isLate, false);
  assert.strictEqual(gs.lateInfo_(cust, ['2026-09-30'], '2026-11-14').isLate, false); // 45 בדיוק — עוד לא
});

test('איחור: לא בלי הזמנות, לא עם תאריך חזרה עתידי, ולא בשלב אחר', () => {
  assert.deepStrictEqual(gs.lateInfo_({ stage: 'לקוח' }, [], '2026-11-21'),
    { rhythm: 0, daysSinceOrder: null, lateBy: 0, isLate: false });
  assert.strictEqual(gs.lateInfo_({ stage: 'לקוח', followUp: '2026-11-25' }, ['2026-09-30'], '2026-11-21').isLate, false);
  assert.strictEqual(gs.lateInfo_({ stage: 'לקוח', followUp: '2026-11-21' }, ['2026-09-30'], '2026-11-21').isLate, true);
  assert.strictEqual(gs.lateInfo_({ stage: 'חזרתי' }, ['2026-09-30'], '2026-11-21').isLate, false);
  assert.strictEqual(gs.lateInfo_({ stage: 'לא רלוונטי' }, ['2026-09-30'], '2026-11-21').isLate, false);
});

test('ימי הזמנה לכל איש קשר — ממוינים, בלי כפילויות, רק "הזמנה"', () => {
  const map = gs.orderDaysByContact_([
    { contactId: 'C1', type: 'הזמנה', at: '2026-10-07 13:22' },
    { contactId: 'C1', type: 'הזמנה', at: '2026-10-01 09:00' },
    { contactId: 'C1', type: 'הזמנה', at: '2026-10-07 14:25' },
    { contactId: 'C1', type: 'שיחה', at: '2026-10-09 10:00' },
    { contactId: 'C2', type: 'הזמנה', at: '2026-09-08 04:52' }
  ]);
  assert.deepStrictEqual(map.C1, ['2026-10-01', '2026-10-07']);
  assert.deepStrictEqual(map.C2, ['2026-09-08']);
});

test('הזמנה ידנית באותו יום מתחברת להזמנה מהאתר — נספרת פעם אחת', () => {
  const m = emptyModel();
  gs.applyEvent_(m, LEAD, NOW);
  const c = m.contacts[0];
  m.activities.push({ id: 'A-m', contactId: c.id, at: '2026-11-02 08:00', type: 'הזמנה',
    text: 'בטלפון', orderId: '', pdf: '', quoteLink: '', by: 'עמוד', _row: 3 });
  gs.recomputeOrders_(m, c);
  const r = gs.applyEvent_(m, ORDER, NOW);
  assert.strictEqual(r.attached, true);
  assert.strictEqual(m.activities.length, 2);
  const a = m.activities[1];
  assert.strictEqual(a.id, 'A-m');
  assert.strictEqual(a.orderId, 'AR-20261101-123456');
  assert.strictEqual(a.pdf, 'https://drive.google.com/file/d/x/view');
  assert.ok(/345\.00 ₪[\s\S]*בטלפון/.test(a.text), a.text);
  assert.strictEqual(a._dirty, true);
  assert.strictEqual(c.orders, '1');
  assert.strictEqual(c.lastOrder, '2026-11-02');
});

test('הזמנה מהאתר ביום אחר מהרישום הידני — שתי הזמנות', () => {
  const m = emptyModel();
  gs.applyEvent_(m, LEAD, NOW);
  const c = m.contacts[0];
  m.activities.push({ id: 'A-m', contactId: c.id, at: '2026-11-01 12:00', type: 'הזמנה',
    text: '', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' });
  const r = gs.applyEvent_(m, ORDER, NOW);
  assert.strictEqual(r.attached, undefined);
  assert.strictEqual(c.orders, '2');
  assert.strictEqual(c.lastOrder, '2026-11-02');
});
```

בבדיקה הקיימת `'API: שלב, תאריך וסוג פעולה לא חוקיים נדחים בלי לשנות'`, להחליף את סוג הפעולה הלא חוקי — "הזמנה" נעשית חוקית:

```js
  assert.strictEqual(app.call({ action: 'log', password: P, id, fields: { stage: 'לקוח' },
    activity: { type: 'משהו', text: 'x' } }).error, 'bad activity');
```

לפני `test('API: doGet — בדיקת חיים בלי נתונים'`, להוסיף:

```js
test('API: order — הזמנה ידנית: לקוח, מונה, היום עם השעה ותאריך אחר ב-12:00', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const r = app.call({ action: 'order', password: P, id, order: { note: 'בטלפון' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.contact.stage, 'לקוח');
  assert.strictEqual(r.contact.followUp, '');
  assert.strictEqual(r.contact.orders, '1');
  assert.strictEqual(r.contact.daysSinceOrder, 0);
  assert.strictEqual(r.activity.type, 'הזמנה');
  assert.strictEqual(r.activity.by, 'עמוד');
  assert.strictEqual(r.activity.at, '2026-11-02 10:42');
  assert.strictEqual(r.activity.text, 'בטלפון');
  const old = app.call({ action: 'order', password: P, id, order: { date: '2026-10-20' } });
  assert.strictEqual(old.activity.at, '2026-10-20 12:00');
  assert.strictEqual(old.contact.orders, '2');
  assert.strictEqual(old.contact.lastOrder, '2026-11-02');
  assert.strictEqual(app.call({ action: 'order', password: P, id, order: { date: '2026-11-03' } }).error, 'bad date');
  assert.strictEqual(app.call({ action: 'order', password: P, id, order: { date: '3.11' } }).error, 'bad date');
  assert.strictEqual(app.call({ action: 'order', password: P, id: 'C-none', order: {} }).error, 'not found');
});

test('API: order_cancel — רק הזמנה ידנית בלי מספר; המונה חוזר והשלב נשאר', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const manual = app.call({ action: 'order', password: P, id, order: { date: '2026-10-20' } }).activity;
  app.call({ action: 'event', secret: S, event: ORDER });
  let list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.contacts[0].orders, '2');
  const site = list.activities.find(a => a.orderId === 'AR-20261101-123456');
  assert.strictEqual(app.call({ action: 'order_cancel', password: P, activityId: site.id }).error, 'not cancellable');
  const r = app.call({ action: 'order_cancel', password: P, activityId: manual.id });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.contact.orders, '1');
  assert.strictEqual(r.contact.stage, 'לקוח');
  list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.activities.some(a => a.id === manual.id), false);
  assert.strictEqual(app.call({ action: 'order_cancel', password: P, activityId: 'A-none' }).error, 'not found');
});

test('API: הזמנה מהאתר באותו יום של רישום ידני נכתבת במקום הרישום', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  app.call({ action: 'order', password: P, id, order: { note: 'בטלפון' } });
  app.call({ action: 'event', secret: S, event: ORDER });
  const list = app.call({ action: 'list', password: P });
  const orders = list.activities.filter(a => a.type === 'הזמנה');
  assert.strictEqual(orders.length, 1);
  assert.strictEqual(orders[0].orderId, 'AR-20261101-123456');
  assert.strictEqual(list.contacts[0].orders, '1');
  assert.strictEqual(app.crm.sheets['פעולות'].untyped, false);
  // אותה הזמנה שוב (ניסיון חוזר) — עדיין כפילות שנחסמת, גם אחרי החיבור
  assert.strictEqual(app.call({ action: 'event', secret: S, event: ORDER }).duplicate, true);
  assert.strictEqual(app.call({ action: 'list', password: P }).contacts[0].orders, '1');
});

test('API: log מסוג הזמנה (התוצאה "הזמין") נספר כהזמנה', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const r = app.call({ action: 'log', password: P, id, fields: { stage: 'לקוח', followUp: '' },
    activity: { type: 'הזמנה', text: 'דרך שיחה' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.contact.orders, '1');
  assert.strictEqual(r.contact.lastOrder, '2026-11-02');
  assert.strictEqual(r.activity.type, 'הזמנה');
});

test('API: list מחזיר קצב ואיחור לכל איש קשר', () => {
  const app = loadApp({ orders: ordersBookWith(ORDER_ROWS) });
  app.call({ action: 'import', password: P, dryRun: false });
  const c = app.call({ action: 'list', password: P }).contacts[0];
  assert.strictEqual(c.rhythm, 0);
  assert.strictEqual(c.daysSinceOrder, 62);
  assert.strictEqual(c.isLate, true);
  assert.strictEqual(c.lateBy, 17);
});
```

- [ ] **Step 2: להריץ ולוודא שהבדיקות נכשלות**

Run: `node tools/test/crm.test.js`
Expected: הקובץ נכשל בטעינה עם `ReferenceError: daysBetween_ is not defined` (הייצוא ב-`loadGs` מפנה לפונקציות שעוד לא קיימות).

- [ ] **Step 3: לממש בסקריפט**

ב-`tools/google-apps-script-crm.gs`:

(א) בראש הקובץ, בתיאור "מי פונה אליו", לעדכן את רשימת הפעולות:

```js
 *  - עמוד ה-CRM (/crm-f428d7/) — עם הסיסמה: list, add, update, log, delete, import,
 *    order, order_cancel.
```

ושורת האפיון:

```js
 * אפיון: docs/superpowers/specs/2026-11-02-crm-design.md
 *        docs/superpowers/specs/2026-11-03-crm-orders-tasks-notifications-design.md
```

(ב) להחליף את `PAGE_ACTIVITY_TYPES` ולהוסיף אחריו את קבועי הקצב:

```js
var PAGE_ACTIVITY_TYPES = ['שיחה', 'וואטסאפ', 'הצעת מחיר', 'הערה', 'שלב', 'הזמנה'];

// קצב הזמנות: הזמנות במרחק של עד 3 ימים נספרות כהזמנה אחת; בלי קצב (פחות
// משלושה ימי הזמנה) לקוח מאחר אחרי 45 יום
var MERGE_DAYS = 3;
var DEFAULT_LATE_DAYS = 45;
```

(ג) אחרי הפונקציה `now_()`, להוסיף:

```js
// ימים בין שני תאריכים (YYYY-MM-DD, או חותמת שמתחילה בתאריך). UTC — בלי קפיצות שעון קיץ.
function dayNum_(s) {
  var p = String(s).slice(0, 10).split('-');
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000;
}

function daysBetween_(a, b) {
  return Math.round(dayNum_(b) - dayNum_(a));
}
```

(ד) בתוך `applyEvent_`, להחליף את הקטע מ-`if (ev.type === 'order') {` ועד סוף הפונקציה:

```js
  if (ev.type === 'order') {
    c.stage = 'לקוח';
    c.followUp = '';
  } else {
    // שלב לא יורד לבד; רק מי שסומן "לא רלוונטי" נפתח מחדש
    if (c.stage === 'לא רלוונטי') c.stage = 'חדש';
    // פנייה חדשה מחזירה ל"לטיפול" — אבל תאריך שכבר עבר נשאר (הוא מוקדם יותר)
    if (!ev.imported && (!c.followUp || c.followUp > now.date)) c.followUp = now.date;
  }
  if (!c.lastActivity || at > c.lastActivity) c.lastActivity = at;
  if (!c.created || at < c.created) c.created = at;
  var activity = activityFor_(ev, c.id, at);
  // הזמנה עם מספר, באותו יום של הזמנה שרועי רשם ידנית — ממלאת את הרישום ולא נספרת פעמיים
  var manual = ev.type === 'order' && orderId ? manualOrderOn_(model, c.id, at.slice(0, 10)) : null;
  if (manual) {
    manual.orderId = activity.orderId;
    manual.pdf = activity.pdf;
    manual.quoteLink = activity.quoteLink;
    manual.text = activity.text + (manual.text ? '\n' + manual.text : '');
    manual._dirty = true;
    recomputeOrders_(model, c);
    return { contact: c, activity: manual, created: created, attached: true };
  }
  model.activities.push(activity);
  if (ev.type === 'order') recomputeOrders_(model, c);
  return { contact: c, activity: activity, created: created };
}

// ---------- הזמנות וקצב ----------

// לכל איש קשר: ימי ההזמנה שלו, ממוינים ובלי כפילויות
function orderDaysByContact_(activities) {
  var map = {};
  activities.forEach(function (a) {
    if (a.type !== 'הזמנה' || !a.at) return;
    var d = String(a.at).slice(0, 10);
    var list = map[a.contactId] || (map[a.contactId] = []);
    if (list.indexOf(d) < 0) list.push(d);
  });
  Object.keys(map).forEach(function (k) { map[k].sort(); });
  return map;
}

// הזמנה שנשלחה כמה פעמים או פוצלה ליומיים נספרת פעם אחת לצורך הקצב
function orderEvents_(days) {
  var out = [];
  days.forEach(function (d) {
    if (!out.length || daysBetween_(out[out.length - 1], d) > MERGE_DAYS) out.push(d);
  });
  return out;
}

// חציון המרווחים בימים שלמים; 0 = אין קצב (פחות משלושה ימי הזמנה)
function rhythmFor_(events) {
  if (events.length < 3) return 0;
  var gaps = [];
  for (var i = 1; i < events.length; i++) gaps.push(daysBetween_(events[i - 1], events[i]));
  gaps.sort(function (a, b) { return a - b; });
  var m = gaps.length;
  return Math.round(m % 2 ? gaps[(m - 1) / 2] : (gaps[m / 2 - 1] + gaps[m / 2]) / 2);
}

// days: ימי ההזמנה של איש הקשר. מאחר — רק "לקוח", לא כשנקבע תאריך חזרה עתידי,
// וכשעבר יותר מהסף: קצב × 1.5 ולפחות קצב + 7, או 45 בלי קצב.
// lateBy נמדד מהקצב (או מ-45), כמו "מאחר ב-22 ימים" באפיון.
function lateInfo_(c, days, today) {
  var info = { rhythm: 0, daysSinceOrder: null, lateBy: 0, isLate: false };
  if (!days || !days.length) return info;
  var rhythm = rhythmFor_(orderEvents_(days));
  var since = daysBetween_(days[days.length - 1], today);
  info.rhythm = rhythm;
  info.daysSinceOrder = since;
  if (c.stage !== 'לקוח' || (c.followUp && c.followUp > today)) return info;
  var threshold = rhythm ? Math.max(Math.round(rhythm * 1.5), rhythm + 7) : DEFAULT_LATE_DAYS;
  if (since > threshold) {
    info.isLate = true;
    info.lateBy = since - (rhythm || DEFAULT_LATE_DAYS);
  }
  return info;
}

// "הזמנות" ו"הזמנה אחרונה" — תמיד מההיסטוריה, כך שביטול או חיבור לא משאירים מונה שגוי
function recomputeOrders_(model, c) {
  var n = 0;
  var last = '';
  model.activities.forEach(function (a) {
    if (a.contactId !== c.id || a.type !== 'הזמנה') return;
    n++;
    var d = String(a.at).slice(0, 10);
    if (d > last) last = d;
  });
  c.orders = String(n);
  c.lastOrder = last;
}

// הזמנה ידנית (נוצרה ע"י "עמוד", בלי מספר) של איש הקשר באותו יום
function manualOrderOn_(model, contactId, day) {
  for (var i = 0; i < model.activities.length; i++) {
    var a = model.activities[i];
    if (a.contactId === contactId && a.type === 'הזמנה' && !a.orderId && a.by === 'עמוד' &&
        String(a.at).slice(0, 10) === day) return a;
  }
  return null;
}

// איש קשר כפי שהעמוד מקבל אותו: שדות הגיליון, ועוד הקצב והאיחור
function contactOut_(c, byContact, today) {
  var out = publicOf_(c, CONTACT_KEYS);
  var late = lateInfo_(c, byContact[c.id], today);
  Object.keys(late).forEach(function (k) { out[k] = late[k]; });
  return out;
}
```

(ה) להחליף את `save_` כולה:

```js
// אנשי קשר עם _row נכתבים במקומם; חדשים ופעולות חדשות — בסוף הלשונית. פעולה
// קיימת שסומנה _dirty (הזמנה ידנית שהתחברה להזמנה מהאתר) נכתבת במקומה.
function save_(model, changedContacts, newActivities) {
  var fresh = [];
  changedContacts.forEach(function (c) {
    if (c._row) writeRows_(model.cs, c._row, [rowOf_(c, CONTACT_KEYS)], CONTACT_KEYS.length);
    else fresh.push(c);
  });
  var next = model.cs.getLastRow() + 1;
  fresh.forEach(function (c, i) { c._row = next + i; });
  writeRows_(model.cs, next, fresh.map(function (c) { return rowOf_(c, CONTACT_KEYS); }), CONTACT_KEYS.length);
  model.activities.forEach(function (a) {
    if (a._dirty && a._row) {
      writeRows_(model.as, a._row, [rowOf_(a, ACTIVITY_KEYS)], ACTIVITY_KEYS.length);
      a._dirty = false;
    }
  });
  writeRows_(model.as, model.as.getLastRow() + 1,
    newActivities.map(function (a) { return rowOf_(a, ACTIVITY_KEYS); }), ACTIVITY_KEYS.length);
}
```

(ו) ב-`handleEvent_`, להחליף את שורת ה-`save_`:

```js
  save_(model, [res.contact], res.attached ? [] : [res.activity]);
```

(ז) להחליף את `handleList_` כולה:

```js
function handleList_() {
  var model = readModel_(book_());
  var today = now_().date;
  var byContact = orderDaysByContact_(model.activities);
  return {
    ok: true,
    today: today,
    contacts: model.contacts.map(function (c) { return contactOut_(c, byContact, today); }),
    activities: model.activities.map(function (a) { return publicOf_(a, ACTIVITY_KEYS); })
  };
}
```

(ח) להחליף את `handleUpdate_` כולה:

```js
function handleUpdate_(id, fields, activity) {
  var model = readModel_(book_());
  var c = contactById_(model, id);
  if (!c) return { ok: false, error: 'not found' };
  if (activity && PAGE_ACTIVITY_TYPES.indexOf(trim_(activity.type)) < 0) {
    return { ok: false, error: 'bad activity' };
  }
  var check = applyFields_(model, c, fields || {});
  if (!check.ok) return check;
  var now = now_();
  var added = [];
  if (activity) {
    added.push({
      id: newId_('A'), contactId: c.id, at: now.stamp, type: trim_(activity.type),
      text: trim_(activity.text).slice(0, 2000), orderId: '', pdf: '', quoteLink: '', by: 'עמוד'
    });
    c.lastActivity = now.stamp;
    model.activities.push(added[0]);
    // התוצאה "הזמין" — הזמנה לכל דבר
    if (added[0].type === 'הזמנה') recomputeOrders_(model, c);
  }
  save_(model, [c], added);
  return {
    ok: true,
    contact: contactOut_(c, orderDaysByContact_(model.activities), now.date),
    activity: added.length ? publicOf_(added[0], ACTIVITY_KEYS) : null
  };
}

// הזמנה שרועי רושם בעצמו, בלי התוכן שלה: תאריך עד היום (ברירת מחדל היום), הערה לא חובה.
// השעה ברישום — עכשיו כשהתאריך הוא היום, ו-12:00 בתאריך אחר.
function handleOrder_(id, input) {
  var model = readModel_(book_());
  var c = contactById_(model, id);
  if (!c) return { ok: false, error: 'not found' };
  var now = now_();
  var day = trim_(input.date) || now.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > now.date) return { ok: false, error: 'bad date' };
  var a = {
    id: newId_('A'), contactId: c.id, at: day === now.date ? now.stamp : day + ' 12:00',
    type: 'הזמנה', text: trim_(input.note).slice(0, 200), orderId: '', pdf: '', quoteLink: '', by: 'עמוד'
  };
  model.activities.push(a);
  c.stage = 'לקוח';
  c.followUp = '';
  c.lastActivity = now.stamp;
  recomputeOrders_(model, c);
  save_(model, [c], [a]);
  return {
    ok: true,
    contact: contactOut_(c, orderDaysByContact_(model.activities), now.date),
    activity: publicOf_(a, ACTIVITY_KEYS)
  };
}

// ביטול הזמנה שנרשמה בטעות — רק ידנית ובלי מספר. השלב לא משתנה.
function handleOrderCancel_(activityId) {
  var model = readModel_(book_());
  var a = null;
  for (var i = 0; i < model.activities.length; i++) {
    if (model.activities[i].id === activityId) { a = model.activities[i]; break; }
  }
  if (!a) return { ok: false, error: 'not found' };
  if (a.type !== 'הזמנה' || a.by !== 'עמוד' || a.orderId) return { ok: false, error: 'not cancellable' };
  var c = contactById_(model, a.contactId);
  model.as.deleteRow(a._row);
  model.activities.splice(model.activities.indexOf(a), 1);
  if (!c) return { ok: true };
  recomputeOrders_(model, c);
  save_(model, [c], []);
  return { ok: true, contact: contactOut_(c, orderDaysByContact_(model.activities), now_().date) };
}
```

(ט) ב-`doPost`, בתוך ה-`switch`, אחרי `case 'import'`:

```js
      case 'order': return json_(withLock_(function () { return handleOrder_(body.id, body.order || {}); }));
      case 'order_cancel': return json_(withLock_(function () { return handleOrderCancel_(body.activityId); }));
```

- [ ] **Step 4: להריץ ולוודא שהכל עובר**

Run: `node tools/test/crm.test.js`
Expected: `כל 47 הבדיקות עברו` (35 קיימות + 12 חדשות).

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js
git commit -m "$(printf 'CRM: רישום הזמנה ידני, ביטול, קצב ואיחור לכל לקוח\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 2: משימות בסקריפט ה-CRM

**Files:**
- Modify: `tools/google-apps-script-crm.gs`
- Test: `tools/test/crm.test.js`

**Interfaces:**
- Consumes: `contactOut_`, `orderDaysByContact_`, ו-`save_` (Task 1).
- Produces:
  - לשונית "משימות" עם `TASK_KEYS = ['id', 'contactId', 'text', 'due', 'time', 'done', 'created', 'reminded']`.
  - `model.tasks` ו-`model.ts` ב-`readModel_`.
  - `saveTasks_(model, tasks)`.
  - `taskById_(model, id)`.
  - פעולות API: `task_add`, ‏`task_update`, ‏`task_delete`.
  - `list.tasks` — רק פתוחות.
  - `delete` (איש קשר) מוחק גם את המשימות שלו.

- [ ] **Step 1: לכתוב את הבדיקות (נכשלות)**

ב-`tools/test/crm.test.js`, לפני `test('API: doGet — בדיקת חיים בלי נתונים'`:

```js
test('API: משימות — כללית ועל לקוח, ולידציה, list מחזיר רק פתוחות, בפורמט טקסט', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const g = app.call({ action: 'task_add', password: P, task: { text: 'להזמין מהספק', due: '2026-11-03' } });
  assert.strictEqual(g.ok, true);
  assert.ok(/^T/.test(g.task.id), g.task.id);
  assert.strictEqual(g.task.contactId, '');
  assert.strictEqual(g.task.created, '2026-11-02 10:42');
  const l = app.call({ action: 'task_add', password: P,
    task: { text: 'להביא דוגמאות', due: '2026-11-02', time: '14:00', contactId: id } });
  assert.strictEqual(l.task.contactId, id);
  assert.strictEqual(l.task.reminded, '');
  assert.strictEqual(app.call({ action: 'task_add', password: P, task: { text: '', due: '2026-11-02' } }).error, 'text required');
  assert.strictEqual(app.call({ action: 'task_add', password: P, task: { text: 'x', due: '2.11' } }).error, 'bad date');
  assert.strictEqual(app.call({ action: 'task_add', password: P,
    task: { text: 'x', due: '2026-11-02', time: '25:00' } }).error, 'bad time');
  assert.strictEqual(app.call({ action: 'task_add', password: P,
    task: { text: 'x', due: '2026-11-02', contactId: 'C-none' } }).error, 'not found');
  const list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.tasks.length, 2);
  assert.strictEqual('_row' in list.tasks[0], false);
  assert.strictEqual(app.crm.sheets['משימות'].rows[0][2], 'משימה');
  assert.strictEqual(app.crm.sheets['משימות'].untyped, false);
});

test('API: משימה עם שעה שכבר עברה — מסומנת כנשלחה; שינוי שעה מאפס', () => {
  const app = loadApp();
  const t = app.call({ action: 'task_add', password: P, task: { text: 'x', due: '2026-11-02', time: '09:00' } }).task;
  assert.strictEqual(t.reminded, '2026-11-02 10:42');
  const u = app.call({ action: 'task_update', password: P, id: t.id, fields: { time: '15:00' } });
  assert.strictEqual(u.task.reminded, '');
  const same = app.call({ action: 'task_update', password: P, id: t.id, fields: { text: 'y' } });
  assert.strictEqual(same.task.reminded, '');
  assert.strictEqual(same.task.text, 'y');
  assert.strictEqual(app.call({ action: 'task_update', password: P, id: 'T-none', fields: {} }).error, 'not found');
});

test('API: סימון משימה על לקוח נרשם בהיסטוריה, ו"בטל" מוחק את הרישום', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const t = app.call({ action: 'task_add', password: P,
    task: { text: 'להביא דוגמאות', due: '2026-11-02', contactId: id } }).task;
  const done = app.call({ action: 'task_update', password: P, id: t.id, fields: { done: true } });
  assert.strictEqual(done.task.done, '2026-11-02 10:42');
  assert.strictEqual(done.activity.type, 'משימה');
  assert.strictEqual(done.activity.text, 'בוצעה: להביא דוגמאות');
  assert.strictEqual(done.contact.id, id);
  let list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.tasks.length, 0);
  assert.strictEqual(list.activities.length, 2);
  const undo = app.call({ action: 'task_update', password: P, id: t.id, fields: { done: false } });
  assert.strictEqual(undo.task.done, '');
  assert.strictEqual(undo.removedActivityId, done.activity.id);
  list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.tasks.length, 1);
  assert.strictEqual(list.activities.length, 1);
});

test('API: משימה כללית נסגרת בלי רישום; מחיקה; מחיקת איש קשר מוחקת את המשימות שלו', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const g = app.call({ action: 'task_add', password: P, task: { text: 'כללית', due: '2026-11-02' } }).task;
  assert.strictEqual(app.call({ action: 'task_update', password: P, id: g.id, fields: { done: true } }).activity, undefined);
  const g2 = app.call({ action: 'task_add', password: P, task: { text: 'למחוק', due: '2026-11-05' } }).task;
  assert.strictEqual(app.call({ action: 'task_delete', password: P, id: g2.id }).ok, true);
  assert.strictEqual(app.call({ action: 'task_delete', password: P, id: g2.id }).error, 'not found');
  app.call({ action: 'task_add', password: P, task: { text: 'של הלקוח', due: '2026-11-02', contactId: id } });
  app.call({ action: 'delete', password: P, id });
  assert.strictEqual(app.call({ action: 'list', password: P }).tasks.length, 0);
});
```

- [ ] **Step 2: להריץ ולוודא שהבדיקות נכשלות**

Run: `node tools/test/crm.test.js`
Expected: ארבע הבדיקות החדשות נכשלות (`unknown action`, או `list.tasks` לא מוגדר), ושאר 47 עוברות.

- [ ] **Step 3: לממש בסקריפט**

(א) אחרי `var ACTIVITY_KEYS = …`, להוסיף:

```js
var TASKS_SHEET = 'משימות';
var TASK_HEADERS = ['מזהה', 'מזהה איש קשר', 'משימה', 'תאריך', 'שעה', 'בוצעה', 'נוצרה', 'תזכורת נשלחה'];
var TASK_KEYS = ['id', 'contactId', 'text', 'due', 'time', 'done', 'created', 'reminded'];
```

(ב) להחליף את `readModel_` כולה:

```js
function readModel_(book) {
  var cs = sheet_(book, CONTACTS_SHEET, CONTACT_HEADERS);
  var as = sheet_(book, ACTIVITIES_SHEET, ACTIVITY_HEADERS);
  var ts = sheet_(book, TASKS_SHEET, TASK_HEADERS);
  return {
    cs: cs, as: as, ts: ts,
    contacts: readRows_(cs, CONTACT_KEYS),
    activities: readRows_(as, ACTIVITY_KEYS),
    tasks: readRows_(ts, TASK_KEYS)
  };
}
```

(ג) אחרי `save_`, להוסיף:

```js
// משימות עם _row נכתבות במקומן; חדשות — בסוף הלשונית
function saveTasks_(model, tasks) {
  var fresh = [];
  tasks.forEach(function (t) {
    if (t._row) writeRows_(model.ts, t._row, [rowOf_(t, TASK_KEYS)], TASK_KEYS.length);
    else fresh.push(t);
  });
  var next = model.ts.getLastRow() + 1;
  fresh.forEach(function (t, i) { t._row = next + i; });
  writeRows_(model.ts, next, fresh.map(function (t) { return rowOf_(t, TASK_KEYS); }), TASK_KEYS.length);
}
```

(ד) ב-`handleList_`, להוסיף שדה אחרי `activities: …`:

```js
    activities: model.activities.map(function (a) { return publicOf_(a, ACTIVITY_KEYS); }),
    tasks: model.tasks
      .filter(function (t) { return !t.done; })
      .map(function (t) { return publicOf_(t, TASK_KEYS); })
```

(ה) להחליף את `handleDelete_` כולה:

```js
function handleDelete_(id) {
  var model = readModel_(book_());
  var c = contactById_(model, id);
  if (!c) return { ok: false, error: 'not found' };
  // מלמטה למעלה, כדי שמחיקת שורה לא תזיז את השורות שעוד לא נמחקו
  var rowsOf = function (list) {
    return list
      .filter(function (x) { return x.contactId === id; })
      .map(function (x) { return x._row; })
      .sort(function (a, b) { return b - a; });
  };
  var rows = rowsOf(model.activities);
  rows.forEach(function (r) { model.as.deleteRow(r); });
  rowsOf(model.tasks).forEach(function (r) { model.ts.deleteRow(r); });
  model.cs.deleteRow(c._row);
  return { ok: true, deleted: rows.length };
}
```

(ו) אחרי `handleOrderCancel_`, להוסיף:

```js
// ---------- משימות ----------

function taskById_(model, id) {
  for (var i = 0; i < model.tasks.length; i++) {
    if (model.tasks[i].id === id) return model.tasks[i];
  }
  return null;
}

// משימה שהשעה שלה כבר עברה כשנוצרה או נערכה — מסומנת כנשלחה, בלי לשלוח
function remindedFor_(t, now) {
  return t.time && (t.due + ' ' + t.time) <= now.stamp ? now.stamp : '';
}

// בודק טקסט, תאריך ושעה לפני שמשנה משהו — שגיאה אחת משאירה את המשימה כמו שהייתה
function taskFields_(t, f) {
  var next = {};
  if ('text' in f) {
    var text = trim_(f.text).slice(0, 300);
    if (!text) return { ok: false, error: 'text required' };
    next.text = text;
  }
  if ('due' in f) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trim_(f.due))) return { ok: false, error: 'bad date' };
    next.due = trim_(f.due);
  }
  if ('time' in f) {
    var time = trim_(f.time);
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: 'bad time' };
    next.time = time;
  }
  Object.keys(next).forEach(function (k) { t[k] = next[k]; });
  return { ok: true };
}

function handleTaskAdd_(input) {
  var model = readModel_(book_());
  var contactId = trim_(input.contactId);
  if (contactId && !contactById_(model, contactId)) return { ok: false, error: 'not found' };
  var now = now_();
  var t = { id: newId_('T'), contactId: contactId, text: '', due: '', time: '', done: '', created: now.stamp, reminded: '' };
  var check = taskFields_(t, { text: input.text, due: input.due, time: input.time || '' });
  if (!check.ok) return check;
  t.reminded = remindedFor_(t, now);
  model.tasks.push(t);
  saveTasks_(model, [t]);
  return { ok: true, task: publicOf_(t, TASK_KEYS) };
}

// fields: text, due, time, done (true = בוצעה, false = נפתחת שוב). משימה על לקוח נרשמת
// בהיסטוריה שלו כשהיא נסגרת, והרישום נמחק כשהיא נפתחת שוב ("בטל" בעמוד).
function handleTaskUpdate_(id, fields) {
  var model = readModel_(book_());
  var t = taskById_(model, id);
  if (!t) return { ok: false, error: 'not found' };
  var now = now_();
  var whenBefore = t.due + ' ' + t.time;
  var check = taskFields_(t, fields);
  if (!check.ok) return check;
  if (t.due + ' ' + t.time !== whenBefore) t.reminded = remindedFor_(t, now);
  var out = { ok: true };
  var c = t.contactId ? contactById_(model, t.contactId) : null;
  if (fields.done === true && !t.done) {
    t.done = now.stamp;
    if (c) {
      var a = {
        id: newId_('A'), contactId: c.id, at: now.stamp, type: 'משימה',
        text: 'בוצעה: ' + t.text, orderId: '', pdf: '', quoteLink: '', by: 'עמוד'
      };
      model.activities.push(a);
      c.lastActivity = now.stamp;
      save_(model, [c], [a]);
      out.activity = publicOf_(a, ACTIVITY_KEYS);
    }
  } else if (fields.done === false && t.done) {
    t.done = '';
    if (c) {
      var text = 'בוצעה: ' + t.text;
      for (var i = model.activities.length - 1; i >= 0; i--) {
        var x = model.activities[i];
        if (x.contactId === c.id && x.type === 'משימה' && x.text === text) {
          model.as.deleteRow(x._row);
          model.activities.splice(i, 1);
          out.removedActivityId = x.id;
          break;
        }
      }
    }
  }
  saveTasks_(model, [t]);
  out.task = publicOf_(t, TASK_KEYS);
  if (c) out.contact = contactOut_(c, orderDaysByContact_(model.activities), now.date);
  return out;
}

function handleTaskDelete_(id) {
  var model = readModel_(book_());
  var t = taskById_(model, id);
  if (!t) return { ok: false, error: 'not found' };
  model.ts.deleteRow(t._row);
  return { ok: true };
}
```

(ז) ב-`doPost`, אחרי `case 'order_cancel'`:

```js
      case 'task_add': return json_(withLock_(function () { return handleTaskAdd_(body.task || {}); }));
      case 'task_update': return json_(withLock_(function () { return handleTaskUpdate_(body.id, body.fields || {}); }));
      case 'task_delete': return json_(withLock_(function () { return handleTaskDelete_(body.id); }));
```

ובראש הקובץ, ברשימת הפעולות:

```js
 *  - עמוד ה-CRM (/crm-f428d7/) — עם הסיסמה: list, add, update, log, delete, import,
 *    order, order_cancel, task_add, task_update, task_delete.
```

- [ ] **Step 4: להריץ ולוודא שהכל עובר**

Run: `node tools/test/crm.test.js`
Expected: `כל 51 הבדיקות עברו`.

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js
git commit -m "$(printf 'CRM: משימות — לשונית בגיליון, הוספה, עריכה, סימון ומחיקה\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 3: התראות — טלגרם על פנייה, תזכורות וסיכום בוקר

**Files:**
- Modify: `tools/google-apps-script-crm.gs`
- Test: `tools/test/crm.test.js`

**Interfaces:**
- Consumes:
  - מ-Task 1: `lateInfo_`, `orderDaysByContact_`, `daysBetween_`, `dayNum_`.
  - מ-Task 2: `saveTasks_`.
- Produces:
  - פונקציות טהורות: `inquiryMessage_(ev, c)`, ‏`dueReminders_(tasks, now)` (מחזירה `{ send, expire }`), ‏`reminderMessage_(t, c, now)`, ‏`digestDue_(now, lastSent)`, ‏`digestFor_(model, now)`, ‏`chatFromUpdates_(upd)`.
  - `telegramSend_(text, buttonText, url)` → בוליאני.
  - פונקציות ציבוריות: `tick()`, ‏`setupNotifications()`.

- [ ] **Step 1: לכתוב את הבדיקות (נכשלות)**

(א) ב-`loadGs()`, להוסיף לייצוא:

```js
    '   rhythmFor_: rhythmFor_, lateInfo_: lateInfo_, recomputeOrders_: recomputeOrders_,' +
    '   inquiryMessage_: inquiryMessage_, dueReminders_: dueReminders_,' +
    '   reminderMessage_: reminderMessage_, digestDue_: digestDue_, digestFor_: digestFor_,' +
    '   chatFromUpdates_: chatFromUpdates_ };')();
```

(ב) להחליף את `loadApp` כולה (הדמויות החדשות: `PropertiesService`, ‏`UrlFetchApp`, ‏`MailApp`, ‏`ScriptApp`, ושעון שאפשר להזיז):

```js
function loadApp(opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-crm.gs'), 'utf8');
  const crm = opts.crm || fakeBook();
  const orders = opts.orders || fakeBook();
  const props = Object.assign({}, opts.props || {});
  const sent = { telegram: [], mails: [], triggers: [], deleted: [] };
  const net = { telegramDown: !!opts.telegramDown, webhook: opts.webhook || '' };
  const clock = { now: opts.now || { date: '2026-11-02', stamp: '2026-11-02 10:42' } };
  const env = {
    SpreadsheetApp: { openById(id) { return id === 'ORDERS-ID' ? orders : crm; } },
    LockService: { getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; } },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput(s) { return { content: s, setMimeType() { return this; } }; }
    },
    Logger: { log() {} },
    Utilities: {
      formatDate(d) {
        const p = n => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
          ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return props[k] == null ? null : props[k]; },
          setProperty(k, v) { props[k] = String(v); }
        };
      }
    },
    UrlFetchApp: {
      fetch(url, o) {
        const method = url.split('/').pop();
        let body = { ok: true };
        if (method === 'sendMessage') {
          sent.telegram.push(JSON.parse(o.payload));
          body = { ok: !net.telegramDown };
        } else if (method === 'getWebhookInfo') {
          body = { ok: true, result: { url: net.webhook } };
        } else if (method === 'deleteWebhook') {
          sent.deleted.push('webhook');
          net.webhook = '';
        } else if (method === 'getUpdates') {
          body = { ok: true, result: opts.updates || [] };
        }
        return { getContentText() { return JSON.stringify(body); } };
      }
    },
    MailApp: { sendEmail(m) { sent.mails.push(m); }, getRemainingDailyQuota() { return 100; } },
    ScriptApp: {
      getProjectTriggers() { return sent.triggers.map(n => ({ getHandlerFunction() { return n; } })); },
      deleteTrigger(t) { sent.triggers.splice(sent.triggers.indexOf(t.getHandlerFunction()), 1); },
      newTrigger(name) {
        const chain = {
          timeBased() { return chain; },
          everyMinutes() { return chain; },
          create() { sent.triggers.push(name); }
        };
        return chain;
      }
    }
  };
  const password = opts.password === undefined ? P : opts.password;
  const secret = opts.secret === undefined ? S : opts.secret;
  const names = Object.keys(env);
  const gsApp = new Function(...names, '__clock',
    src + '\n' +
    "SPREADSHEET_ID = 'CRM-ID'; ORDERS_SPREADSHEET_ID = 'ORDERS-ID';\n" +
    'CRM_PASSWORD = ' + JSON.stringify(password) + '; CRM_SECRET = ' + JSON.stringify(secret) + ';\n' +
    'now_ = function () { return __clock.now; };\n' +
    'return { doPost: doPost, doGet: doGet, tick: tick, setupNotifications: setupNotifications };'
  )(...names.map(n => env[n]), clock);
  gsApp.crm = crm;
  gsApp.props = props;
  gsApp.sent = sent;
  gsApp.setNow = (now) => { clock.now = now; };
  gsApp.setTelegramDown = (v) => { net.telegramDown = v; };
  gsApp.call = (body) => JSON.parse(gsApp.doPost({ postData: { contents: JSON.stringify(body) } }).content);
  return gsApp;
}
```

(ג) לפני `// ---------- ייבוא ----------`, להוסיף את הבדיקות הטהורות:

```js
// ---------- התראות ----------

test('טלגרם על פנייה: ליד ובקשת הצעה, טלפון בינלאומי וקישור לכרטיס', () => {
  const c = { id: 'C1', business: 'מסעדת הגפן', name: 'דנה כהן', phone: '0501234567' };
  const m = gs.inquiryMessage_(LEAD, c);
  assert.strictEqual(m.text,
    'פנייה חדשה מהאתר\nמסעדת הגפן · דנה כהן\n+972501234567\nפנייה חדשה מעמוד צור קשר — צריך הצעה לחד פעמי');
  assert.strictEqual(m.button, 'פתח בכרטיס');
  assert.strictEqual(m.url, 'https://aroam.co.il/crm-f428d7/#c=C1');
  const q = gs.inquiryMessage_({ type: 'quote_request', totalItems: 12 }, c);
  assert.ok(q.text.indexOf('בקשת הצעת מחיר') === 0, q.text);
  assert.ok(/12 פריטים$/.test(q.text), q.text);
});

test('תזכורות: בשעה — נשלחת; לפני — לא; נשלחה, בוצעה או בלי שעה — לא; אחרי שעתיים — פוקעת', () => {
  const now = { date: '2026-11-02', stamp: '2026-11-02 14:03' };
  const t = (o) => Object.assign({ id: 'T', contactId: '', text: 'x', due: '2026-11-02', time: '14:00',
    done: '', reminded: '' }, o);
  const r = gs.dueReminders_([t({ id: 'a' }), t({ id: 'b', time: '14:30' }),
    t({ id: 'c', reminded: '2026-11-02 14:00' }), t({ id: 'd', done: '2026-11-02 13:00' }),
    t({ id: 'e', time: '' }), t({ id: 'f', time: '11:30' })], now);
  assert.deepStrictEqual(r.send.map(x => x.id), ['a']);
  assert.deepStrictEqual(r.expire.map(x => x.id), ['f']);
  const overnight = gs.dueReminders_([t({ id: 'n', due: '2026-11-01', time: '23:30' })],
    { date: '2026-11-02', stamp: '2026-11-02 00:20' });
  assert.deepStrictEqual(overnight.send.map(x => x.id), ['n']);
});

test('תזכורת: שם הלקוח והקישור; "(באיחור)" אחרי חצי שעה', () => {
  const c = { id: 'C1', business: 'גן תות', name: '' };
  const t = { text: 'להביא דוגמאות', due: '2026-11-02', time: '14:00' };
  const m1 = gs.reminderMessage_(t, c, { date: '2026-11-02', stamp: '2026-11-02 14:04' });
  assert.strictEqual(m1.text, 'תזכורת: להביא דוגמאות\nגן תות');
  assert.strictEqual(m1.url, 'https://aroam.co.il/crm-f428d7/#c=C1');
  const m2 = gs.reminderMessage_(t, null, { date: '2026-11-02', stamp: '2026-11-02 14:45' });
  assert.strictEqual(m2.text, 'תזכורת: להביא דוגמאות (באיחור)');
  assert.strictEqual(m2.button, 'פתח את ה-CRM');
  assert.strictEqual(m2.url, 'https://aroam.co.il/crm-f428d7/');
});

test('סיכום הבוקר: ראשון עד שישי, 07:30–12:00, פעם ביום', () => {
  const at = (date, time) => ({ date, stamp: date + ' ' + time });
  assert.strictEqual(gs.digestDue_(at('2026-11-02', '07:31'), null), true);          // שני
  assert.strictEqual(gs.digestDue_(at('2026-11-02', '07:29'), null), false);
  assert.strictEqual(gs.digestDue_(at('2026-11-02', '12:00'), null), false);
  assert.strictEqual(gs.digestDue_(at('2026-11-02', '08:00'), '2026-11-02'), false);
  assert.strictEqual(gs.digestDue_(at('2026-11-07', '08:00'), null), false);         // שבת
  assert.strictEqual(gs.digestDue_(at('2026-11-06', '08:00'), '2026-11-05'), true);  // שישי
});

test('סיכום הבוקר: ריק — null; משימות, למי לחזור ולא הזמינו — עשרה ועוד', () => {
  const now = { date: '2026-11-21', stamp: '2026-11-21 07:30' };
  assert.strictEqual(gs.digestFor_({ contacts: [], activities: [], tasks: [] }, now), null);
  const contacts = [
    { id: 'L', name: '', business: 'ליד <חדש>', phone: '', stage: 'חדש', followUp: '2026-11-21', created: '2026-11-21 06:00' },
    { id: 'B', name: '', business: 'חזרתי באיחור', phone: '', stage: 'חזרתי', followUp: '2026-11-19', created: '2026-10-01 06:00' }
  ];
  const activities = [];
  for (let i = 0; i < 12; i++) {
    contacts.push({ id: 'K' + i, name: '', business: 'לקוח ' + i, phone: '', stage: 'לקוח', followUp: '',
      created: '2026-01-01 06:00' });
    activities.push({ contactId: 'K' + i, type: 'הזמנה', at: '2026-09-' + (10 + i) + ' 10:00' });
  }
  const tasks = [
    { id: 'T1', contactId: 'B', text: 'להתקשר', due: '2026-11-21', time: '14:00', done: '' },
    { id: 'T2', contactId: '', text: 'להזמין מהספק', due: '2026-11-20', time: '', done: '' },
    { id: 'T3', contactId: '', text: 'עתידית', due: '2026-11-25', time: '', done: '' }
  ];
  const d = gs.digestFor_({ contacts, activities, tasks }, now);
  assert.strictEqual(d.subject, 'CRM — 2 משימות · 2 לחזור · 12 לא הזמינו');
  assert.ok(d.text.indexOf('• להזמין מהספק — באיחור יום') >= 0, d.text);
  assert.ok(d.text.indexOf('• להתקשר — חזרתי באיחור · היום 14:00') >= 0, d.text);
  assert.ok(d.text.indexOf('• לקוח 0 — אחרונה לפני 72 ימים') >= 0, d.text);
  assert.ok(d.text.indexOf('ועוד 2') >= 0, d.text);
  assert.strictEqual(d.text.indexOf('עתידית'), -1);
  assert.ok(d.html.indexOf('ליד &lt;חדש&gt;') >= 0, d.html);
  assert.ok(d.html.indexOf('href="https://aroam.co.il/crm-f428d7/#c=B"') >= 0, d.html);
  assert.strictEqual(d.telegram.indexOf('בוקר טוב — 2 משימות · 2 לחזור · 12 לא הזמינו'), 0);
  assert.ok(d.telegram.indexOf('ועוד 7') >= 0, d.telegram);
});

test('הצ\'אט מההודעה האחרונה לבוט — רק פרטי', () => {
  assert.strictEqual(gs.chatFromUpdates_({ result: [{ message: { chat: { id: 7, type: 'group' } } },
    { message: { chat: { id: 99, type: 'private' } } }] }), '99');
  assert.strictEqual(gs.chatFromUpdates_({ result: [] }), '');
  assert.strictEqual(gs.chatFromUpdates_(null), '');
});
```

(ד) לפני `test('API: doGet — בדיקת חיים בלי נתונים'`, להוסיף את בדיקות ה-API:

```js
test('API: ליד ובקשת הצעה שולחים טלגרם; הזמנה לא; כשל בטלגרם לא מפיל', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' } });
  const r = app.call({ action: 'event', secret: S, event: LEAD });
  assert.strictEqual('notify' in r, false);
  assert.strictEqual(app.sent.telegram.length, 1);
  assert.strictEqual(app.sent.telegram[0].chat_id, '42');
  assert.strictEqual(app.sent.telegram[0].text.indexOf('פנייה חדשה מהאתר'), 0);
  assert.strictEqual(app.sent.telegram[0].reply_markup.inline_keyboard[0][0].text, 'פתח בכרטיס');
  app.call({ action: 'event', secret: S, event: { type: 'quote_request', orderId: 'HM-20261102-000001',
    business: 'מוסך הגליל', contact: 'משה', phone: '0547781203', totalItems: 4 } });
  assert.strictEqual(app.sent.telegram.length, 2);
  assert.strictEqual(app.sent.telegram[1].text.indexOf('בקשת הצעת מחיר'), 0);
  app.call({ action: 'event', secret: S, event: ORDER });
  assert.strictEqual(app.sent.telegram.length, 2);
  const down = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' }, telegramDown: true });
  assert.strictEqual(down.call({ action: 'event', secret: S, event: LEAD }).ok, true);
  assert.strictEqual(down.call({ action: 'list', password: P }).contacts.length, 1);
  const none = loadApp();
  assert.strictEqual(none.call({ action: 'event', secret: S, event: LEAD }).ok, true);
  assert.strictEqual(none.sent.telegram.length, 0);
});

test('API: ייבוא לא שולח טלגרם — גם לא על בקשת הצעת מחיר', () => {
  const rows = ORDER_ROWS.concat([[new Date(2026, 8, 4, 9, 0), 'HM-20260904-444444', '', 'מוסך הגליל', 'משה',
    '0547781203', '', '', '...', 2, '', 'חדשה', '', '', '', '']]);
  const app = loadApp({ orders: ordersBookWith(rows), props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' } });
  assert.strictEqual(app.call({ action: 'import', password: P, dryRun: false }).summary.activities, 2);
  assert.strictEqual(app.sent.telegram.length, 0);
});

test('tick: תזכורת נשלחת פעם אחת, בשעה שלה', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42', LAST_DIGEST: '2026-11-02' } });
  app.call({ action: 'task_add', password: P, task: { text: 'להתקשר', due: '2026-11-02', time: '14:00' } });
  app.setNow({ date: '2026-11-02', stamp: '2026-11-02 13:58' });
  app.tick();
  assert.strictEqual(app.sent.telegram.length, 0);
  app.setNow({ date: '2026-11-02', stamp: '2026-11-02 14:02' });
  app.tick();
  app.tick();
  assert.strictEqual(app.sent.telegram.length, 1);
  assert.strictEqual(app.sent.telegram[0].text, 'תזכורת: להתקשר');
});

test('tick: שליחה שנכשלה חוזרת בריצה הבאה', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42', LAST_DIGEST: '2026-11-02' },
    telegramDown: true });
  app.call({ action: 'task_add', password: P, task: { text: 'x', due: '2026-11-02', time: '14:00' } });
  app.setNow({ date: '2026-11-02', stamp: '2026-11-02 14:02' });
  app.tick();
  app.setTelegramDown(false);
  app.tick();
  assert.strictEqual(app.sent.telegram.length, 2);
  app.tick();
  assert.strictEqual(app.sent.telegram.length, 2);
});

test('tick: סיכום הבוקר נשלח פעם אחת ביום, במייל ובטלגרם', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' } });
  app.call({ action: 'event', secret: S, event: LEAD });
  app.sent.telegram.length = 0;
  app.setNow({ date: '2026-11-03', stamp: '2026-11-03 07:32' });
  app.tick();
  app.tick();
  assert.strictEqual(app.sent.mails.length, 1);
  assert.strictEqual(app.sent.mails[0].to, 'meiraroam@gmail.com');
  assert.ok(app.sent.mails[0].subject.indexOf('1 לחזור') > 0, app.sent.mails[0].subject);
  assert.ok(app.sent.mails[0].htmlBody.indexOf('מסעדת הגפן') > 0);
  assert.strictEqual(app.sent.telegram.length, 1);
  assert.strictEqual(app.props.LAST_DIGEST, '2026-11-03');
});

test('setupNotifications: מנתק webhook ישן, שומר את הצ\'אט, הודעת בדיקה וטריגר אחד', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok' }, webhook: 'https://script.google.com/old',
    updates: [{ message: { chat: { id: 7, type: 'group' } } }, { message: { chat: { id: 99, type: 'private' } } }] });
  app.setupNotifications();
  app.setupNotifications();
  assert.deepStrictEqual(app.sent.deleted, ['webhook']);
  assert.strictEqual(app.props.TELEGRAM_CHAT_ID, '99');
  assert.strictEqual(app.sent.telegram[0].text, 'ה-CRM מחובר. מכאן יגיעו ההתראות.');
  assert.deepStrictEqual(app.sent.triggers, ['tick']);
});

test('setupNotifications: בלי טוקן, או בלי הודעה לבוט — עוצר עם הסבר', () => {
  assert.throws(() => loadApp().setupNotifications(), /TELEGRAM_TOKEN/);
  assert.throws(() => loadApp({ props: { TELEGRAM_TOKEN: 'tok' } }).setupNotifications(), /שלחו לבוט הודעה/);
});
```

- [ ] **Step 2: להריץ ולוודא שהבדיקות נכשלות**

Run: `node tools/test/crm.test.js`
Expected: הקובץ נכשל בטעינה עם `ReferenceError: inquiryMessage_ is not defined`.

- [ ] **Step 3: לממש בסקריפט**

(א) אחרי `var DEFAULT_LATE_DAYS = 45;`, להוסיף:

```js
// התראות (אפיון 2026-11-03). הטוקן והצ'אט של הבוט — ב-Script Properties בלבד:
// TELEGRAM_TOKEN (רועי מדביק), TELEGRAM_CHAT_ID (setupNotifications שומרת).
var NOTIFY_EMAIL = 'meiraroam@gmail.com';
var CRM_PAGE_URL = 'https://aroam.co.il/crm-f428d7/';
var DIGEST_FROM = '07:30';
var DIGEST_UNTIL = '12:00';
var REMIND_RETRY_MINUTES = 120;
var REMIND_LATE_MINUTES = 30;
```

(ב) ב-`handleEvent_`, להחליף את שתי השורות האחרונות:

```js
  save_(model, [res.contact], res.attached ? [] : [res.activity]);
  var out = { ok: true, id: res.contact.id };
  if ((ev.type === 'lead' || ev.type === 'quote_request') && !ev.imported) {
    out.notify = inquiryMessage_(ev, res.contact);
  }
  return out;
}
```

(ג) ב-`doPost`, להחליף את ענף ה-`event`:

```js
    if (body.action === 'event') {
      if (!authorized_(CRM_SECRET, body.secret)) return json_({ ok: false, error: 'unauthorized' });
      var res = withLock_(function () { return handleEvent_(body.event || {}); });
      // טלגרם מחוץ לנעילה: שליחה איטית לא מעכבת שמירות אחרות, וכשל בה לא מפיל את האירוע
      if (res.notify) {
        telegramSend_(res.notify.text, res.notify.button, res.notify.url);
        delete res.notify;
      }
      return json_(res);
    }
```

(ד) לפני `// ---------- כניסה ----------`, להוסיף:

```js
// ---------- התראות ----------

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cmp_(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function formatPhone_(d) {
  d = String(d || '');
  if (/^0[57]\d{8}$/.test(d)) return d.slice(0, 3) + '-' + d.slice(3);
  if (/^0[2-489]\d{7}$/.test(d)) return d.slice(0, 2) + '-' + d.slice(2);
  return d;
}

function displayName_(c) {
  return trim_(c.business) || trim_(c.name) || formatPhone_(c.phone) || 'ללא שם';
}

// דקות מאז "תחילת הזמן" — להשוואת חותמות YYYY-MM-DD HH:mm, גם מעבר לחצות
function minutesOf_(stamp) {
  var t = String(stamp).slice(11, 16).split(':');
  return dayNum_(stamp) * 1440 + Number(t[0] || 0) * 60 + Number(t[1] || 0);
}

// 0 = ראשון … 6 = שבת
function weekday_(day) {
  return new Date(dayNum_(day) * 86400000).getUTCDay();
}

function lateDays_(n) {
  return n === 1 ? 'באיחור יום' : 'באיחור ' + n + ' ימים';
}

// אותו סדר כמו "לטיפול" בעמוד: חדשים, באיחור, של היום
function todoGroup_(c, today) {
  if (c.stage === 'חדש') return 0;
  return c.followUp && c.followUp < today ? 1 : 2;
}

// טלגרם על פנייה חדשה: מי, טלפון (טלגרם הופך מספר בינלאומי ללחיץ) ומה ביקש
function inquiryMessage_(ev, c) {
  var lines = [ev.type === 'quote_request' ? 'בקשת הצעת מחיר' : 'פנייה חדשה מהאתר'];
  var who = [trim_(c.business), trim_(c.name)].filter(function (x) { return x; }).join(' · ');
  if (who) lines.push(who);
  if (c.phone) lines.push(/^0\d+$/.test(c.phone) ? '+972' + c.phone.slice(1) : c.phone);
  var what = ev.type === 'quote_request'
    ? (trim_(ev.totalItems) ? trim_(ev.totalItems) + ' פריטים' : '')
    : [trim_(ev.subject), trim_(ev.message).split('\n')[0]].filter(function (x) { return x; }).join(' — ');
  if (what) lines.push(what.slice(0, 200));
  return { text: lines.join('\n'), button: 'פתח בכרטיס', url: CRM_PAGE_URL + '#c=' + c.id };
}

// משימות שהגיע זמן התזכורת שלהן. send — לשלוח עכשיו; expire — עברו יותר משעתיים
// מהשעה (אחרי תקלה): מסמנים כנשלחו בלי לשלוח, כדי לא לשלוח תזכורת ישנה
function dueReminders_(tasks, now) {
  var out = { send: [], expire: [] };
  tasks.forEach(function (t) {
    if (t.done || !t.time || t.reminded) return;
    var when = t.due + ' ' + t.time;
    if (when > now.stamp) return;
    var late = minutesOf_(now.stamp) - minutesOf_(when);
    (late > REMIND_RETRY_MINUTES ? out.expire : out.send).push(t);
  });
  return out;
}

function reminderMessage_(t, c, now) {
  var late = minutesOf_(now.stamp) - minutesOf_(t.due + ' ' + t.time) > REMIND_LATE_MINUTES;
  var text = 'תזכורת: ' + t.text + (late ? ' (באיחור)' : '') + (c ? '\n' + displayName_(c) : '');
  return c
    ? { text: text, button: 'פתח בכרטיס', url: CRM_PAGE_URL + '#c=' + c.id }
    : { text: text, button: 'פתח את ה-CRM', url: CRM_PAGE_URL };
}

// סיכום הבוקר: פעם ביום, מראשון עד שישי, בריצה הראשונה בין 07:30 ל-12:00
function digestDue_(now, lastSent) {
  var time = now.stamp.slice(11, 16);
  return weekday_(now.date) !== 6 && time >= DIGEST_FROM && time < DIGEST_UNTIL && lastSent !== now.date;
}

// סיכום הבוקר — null כשאין שום דבר לטיפול
function digestFor_(model, now) {
  var today = now.date;
  var tasks = model.tasks
    .filter(function (t) { return !t.done && t.due <= today; })
    .sort(function (a, b) {
      return cmp_(a.due, b.due) || (a.time ? 1 : 0) - (b.time ? 1 : 0) || cmp_(a.time, b.time);
    });
  var todo = model.contacts
    .filter(function (c) {
      if (c.stage === 'לא רלוונטי') return false;
      return c.followUp ? c.followUp <= today : c.stage === 'חדש';
    })
    .sort(function (a, b) {
      var ga = todoGroup_(a, today);
      var gb = todoGroup_(b, today);
      if (ga !== gb) return ga - gb;
      if (ga === 0) return cmp_(b.created, a.created);
      if (ga === 1) return cmp_(a.followUp, b.followUp);
      return 0;
    });
  var byContact = orderDaysByContact_(model.activities);
  var late = model.contacts
    .map(function (c) { return { c: c, info: lateInfo_(c, byContact[c.id], today) }; })
    .filter(function (x) { return x.info.isLate; })
    .sort(function (a, b) { return b.info.lateBy - a.info.lateBy; });
  if (!tasks.length && !todo.length && !late.length) return null;

  var link = function (c) { return CRM_PAGE_URL + '#c=' + c.id; };
  var sections = [];
  if (tasks.length) {
    sections.push({ title: 'משימות', items: tasks.map(function (t) {
      var c = t.contactId ? contactById_(model, t.contactId) : null;
      var when = t.due < today ? lateDays_(daysBetween_(t.due, today)) : 'היום' + (t.time ? ' ' + t.time : '');
      return { name: t.text, url: c ? link(c) : CRM_PAGE_URL, detail: (c ? displayName_(c) + ' · ' : '') + when };
    }) });
  }
  if (todo.length) {
    sections.push({ title: 'לחזור', items: todo.map(function (c) {
      var when = c.followUp && c.followUp < today ? lateDays_(daysBetween_(c.followUp, today)) : 'היום';
      return { name: displayName_(c), url: link(c), detail: (c.stage === 'חדש' ? 'ליד חדש · ' : '') + when };
    }) });
  }
  if (late.length) {
    sections.push({ title: 'לא הזמינו', more: Math.max(0, late.length - 10), items: late.slice(0, 10).map(function (x) {
      return { name: displayName_(x.c), url: link(x.c),
        detail: 'אחרונה לפני ' + x.info.daysSinceOrder + ' ימים' +
          (x.info.rhythm ? ' (בדרך כלל כל ' + x.info.rhythm + ')' : '') };
    }) });
  }

  var parts = [];
  if (tasks.length) parts.push(tasks.length === 1 ? 'משימה אחת' : tasks.length + ' משימות');
  if (todo.length) parts.push(todo.length + ' לחזור');
  if (late.length) parts.push(late.length + ' לא הזמינו');
  var text = [];
  var html = ['<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">'];
  var tg = ['בוקר טוב — ' + parts.join(' · ')];
  sections.forEach(function (s) {
    text.push(s.title + ':');
    html.push('<h3 style="margin:16px 0 6px">' + esc_(s.title) + '</h3><ul style="margin:0;padding-inline-start:18px">');
    tg.push('', s.title + ':');
    s.items.forEach(function (it, i) {
      text.push('• ' + it.name + ' — ' + it.detail + '\n  ' + it.url);
      html.push('<li><a href="' + esc_(it.url) + '">' + esc_(it.name) + '</a> — ' + esc_(it.detail) + '</li>');
      if (i < 5) tg.push('• ' + it.name + ' — ' + it.detail);
    });
    if (s.more) {
      text.push('ועוד ' + s.more);
      html.push('<li>ועוד ' + s.more + '</li>');
    }
    var rest = Math.max(0, s.items.length - 5) + (s.more || 0);
    if (rest) tg.push('ועוד ' + rest);
    html.push('</ul>');
    text.push('');
  });
  text.push('ה-CRM: ' + CRM_PAGE_URL);
  html.push('<p style="margin-top:16px"><a href="' + CRM_PAGE_URL + '">פתח את ה-CRM</a></p></div>');
  return {
    subject: 'CRM — ' + parts.join(' · '),
    text: text.join('\n'),
    html: html.join(''),
    telegram: tg.join('\n')
  };
}

// שליחה לטלגרם. false כשאין טוקן או צ'אט, או כשהשליחה נכשלה — כולל HTTP 200 בלי ok
// בגוף התשובה (הלקח מסבב 62). הטוקן לא נכתב ליומן.
function telegramSend_(text, buttonText, url) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  var chat = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chat) return false;
  var body = { chat_id: chat, text: String(text).slice(0, 4000), disable_web_page_preview: true };
  if (buttonText && url) body.reply_markup = { inline_keyboard: [[{ text: buttonText, url: url }]] };
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify(body)
    });
    var parsed = JSON.parse(res.getContentText());
    if (parsed && parsed.ok === true) return true;
    Logger.log('Telegram: ' + res.getContentText().slice(0, 200));
  } catch (e) {
    Logger.log('Telegram: ' + e);
  }
  return false;
}

function telegramGet_(token, method) {
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, { muteHttpExceptions: true });
  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false };
  }
}

// הצ'אט הפרטי מההודעה האחרונה שנשלחה לבוט
function chatFromUpdates_(upd) {
  var list = (upd && upd.result) || [];
  for (var i = list.length - 1; i >= 0; i--) {
    var m = list[i].message || list[i].edited_message;
    if (m && m.chat && m.chat.type === 'private') return String(m.chat.id);
  }
  return '';
}

// טריגר זמן, כל 5 דקות (נוצר ב-setupNotifications): תזכורות למשימות עם שעה, וסיכום הבוקר.
// טריגר מריץ את הקוד השמור בפרויקט, ולא גרסה פרוסה.
function tick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var now = now_();
    var model = readModel_(book_());
    var due = dueReminders_(model.tasks, now);
    var changed = [];
    due.expire.forEach(function (t) {
      t.reminded = now.stamp;
      changed.push(t);
    });
    due.send.forEach(function (t) {
      var msg = reminderMessage_(t, t.contactId ? contactById_(model, t.contactId) : null, now);
      if (telegramSend_(msg.text, msg.button, msg.url)) {
        t.reminded = now.stamp;
        changed.push(t);
      }
    });
    if (changed.length) saveTasks_(model, changed);
    var props = PropertiesService.getScriptProperties();
    if (digestDue_(now, props.getProperty('LAST_DIGEST'))) {
      props.setProperty('LAST_DIGEST', now.date);
      var d = digestFor_(model, now);
      if (d) {
        try {
          MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: d.subject, body: d.text, htmlBody: d.html });
        } catch (e) {
          Logger.log('CRM digest: ' + e);
        }
        telegramSend_(d.telegram, 'פתח את ה-CRM', CRM_PAGE_URL);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

// הרצה ידנית אחת מהעורך, אחרי ש-TELEGRAM_TOKEN הודבק ב-Script Properties ונשלחה לבוט הודעה.
// מבקשת את ההרשאות (רשת, מייל, טריגרים), מנתקת webhook ישן, שומרת את הצ'אט, שולחת
// הודעת בדיקה ויוצרת את טריגר ה-tick. אפשר להריץ שוב — הטריגר לא מוכפל.
function setupNotifications() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('חסר TELEGRAM_TOKEN בהגדרות הפרויקט (Script Properties).');
  var info = telegramGet_(token, 'getWebhookInfo');
  if (!info.ok) throw new Error('הטוקן לא תקין — בדקו אותו ב-BotFather.');
  if (info.result && info.result.url) telegramGet_(token, 'deleteWebhook');
  var chat = chatFromUpdates_(telegramGet_(token, 'getUpdates'));
  if (!chat) throw new Error('שלחו לבוט הודעה כלשהי בטלגרם, והריצו שוב.');
  props.setProperty('TELEGRAM_CHAT_ID', chat);
  if (!telegramSend_('ה-CRM מחובר. מכאן יגיעו ההתראות.', 'פתח את ה-CRM', CRM_PAGE_URL)) {
    throw new Error('הודעת הבדיקה לא נשלחה.');
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  MailApp.getRemainingDailyQuota();
  Logger.log('ההתראות מחוברות.');
}
```

בראש הקובץ, בתיאור, להוסיף שורה:

```js
 *  - טריגר זמן (tick, כל 5 דקות) — תזכורות למשימות וסיכום הבוקר. מוקם ב-setupNotifications.
```

- [ ] **Step 4: להריץ ולוודא שהכל עובר**

Run: `node tools/test/crm.test.js`
Expected: `כל 64 הבדיקות עברו`.

Run: `node --check tools/google-apps-script-crm.gs`
Expected: בלי פלט (תחביר תקין).

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js
git commit -m "$(printf 'CRM: טלגרם על פנייה חדשה, תזכורות למשימות וסיכום בוקר\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 4: לוגיקת העמוד — crm-core.js

**Files:**
- Modify: `crm-f428d7/crm-core.js`
- Test: `tools/test/crm-page.test.js`

**Interfaces:**
- Consumes: שדות אנשי הקשר והמשימות מ-`list` (Contracts).
- Produces (על `CrmCore`):
  - הזמנות: `ordersLine(c)`, ‏`lateLabel(c)`, ‏`orderSubLine(c)`, ‏`orderOn(activities, contactId, day)`, ‏`isManualOrder(a)`.
  - משימות: `isTaskDue(t, today)`, `isTaskLate(t, today)`, `sortTasks(tasks)`, `dueTasks(tasks, today)`, `openTasksOf(tasks, contactId)`, `taskDueLabel(t, today)`, `validateTask(input)`, `taskMatchesQuery(t, contact, query)`.
  - שינויים בקיימות:
    - `counts(contacts, today, tasks)` — מחזירה גם `tasks` ו-`late`, ו-`todo` כולל משימות שהגיע זמנן.
    - `filterContacts` — מכירה את `'late'` ואת `'tasks'`.
    - `subLine(c, today, ordersView)` — עם ordersView: "הזמנה אחרונה לפני N ימים" במקום תאריך הפעולה האחרונה.
    - `applyOutcome(c, key, channel, today, follow, note, recordOrder)` — "הזמין" נרשם כפעולה מסוג "הזמנה", אלא אם `recordOrder === false`.

- [ ] **Step 1: לכתוב את הבדיקות (נכשלות)**

ב-`tools/test/crm-page.test.js`, לפני `let failed = 0;`:

```js
test('הזמנות: שורת הכרטיס, תווית איחור ושורת הרשימה', () => {
  assert.strictEqual(C.ordersLine(mk({ orders: '4', daysSinceOrder: 52, rhythm: 30 })),
    '4 הזמנות · אחרונה לפני 52 ימים · בדרך כלל כל 30 יום');
  assert.strictEqual(C.ordersLine(mk({ orders: '1', daysSinceOrder: 0, rhythm: 0 })), 'הזמנה אחת · אחרונה היום');
  assert.strictEqual(C.ordersLine(mk({ orders: '3', daysSinceOrder: 1, rhythm: 7 })),
    '3 הזמנות · אחרונה אתמול · בדרך כלל כל 7 ימים');
  assert.strictEqual(C.ordersLine(mk({})), 'אין הזמנה רשומה');
  assert.strictEqual(C.lateLabel(mk({ isLate: true, lateBy: 22 })), 'מאחר ב-22 ימים');
  assert.strictEqual(C.lateLabel(mk({ isLate: true, lateBy: 1 })), 'מאחר ביום');
  assert.strictEqual(C.lateLabel(mk({ isLate: false, lateBy: 0 })), '');
  assert.strictEqual(C.orderSubLine(mk({ daysSinceOrder: 52 })), 'הזמנה אחרונה לפני 52 ימים');
  assert.strictEqual(C.orderSubLine(mk({})), '');
  assert.strictEqual(C.subLine(mk({ daysSinceOrder: 52 }), TODAY, true), 'דנה · אתר · הזמנה אחרונה לפני 52 ימים');
  assert.strictEqual(C.subLine(mk({ lastActivity: '2026-11-02 08:00' }), TODAY, true), 'דנה · אתר · היום');
  assert.strictEqual(C.subLine(mk({ daysSinceOrder: 52, lastActivity: '2026-11-02 08:00' }), TODAY), 'דנה · אתר · היום');
});

test('לא הזמינו: סינון וסדר לפי האיחור; מונים עם משימות', () => {
  const list = [mk({ id: 'a', stage: 'לקוח', isLate: true, lateBy: 7 }),
    mk({ id: 'b', stage: 'לקוח', isLate: true, lateBy: 22 }), mk({ id: 'c', stage: 'לקוח' })];
  assert.deepStrictEqual(C.filterContacts(list, 'late', '', TODAY).map(c => c.id), ['b', 'a']);
  const tasks = [{ id: 'T1', due: TODAY, time: '', done: '' }, { id: 'T2', due: '2026-11-09', time: '', done: '' }];
  const n = C.counts(list, TODAY, tasks);
  assert.strictEqual(n.late, 2);
  assert.strictEqual(n.tasks, 2);
  assert.strictEqual(n.todo, 1);
  assert.strictEqual(C.filterContacts(list, 'tasks', '', TODAY).length, 0);
  assert.strictEqual(C.FILTERS.map(f => f.key).slice(0, 3).join(','), 'todo,tasks,late');
});

test('משימות: סדר, תוויות, משימות של איש קשר וולידציה', () => {
  const t = (o) => Object.assign({ id: 'T', contactId: '', text: 'x', due: TODAY, time: '', done: '' }, o);
  const tasks = [t({ id: 'today-14', time: '14:00' }), t({ id: 'late', due: '2026-10-30' }),
    t({ id: 'today', time: '' }), t({ id: 'future', due: '2026-11-04' }), t({ id: 'done', done: 'x' })];
  assert.deepStrictEqual(C.dueTasks(tasks, TODAY).map(x => x.id), ['late', 'today', 'today-14']);
  assert.deepStrictEqual(C.sortTasks(tasks.filter(x => !x.done)).map(x => x.id),
    ['late', 'today', 'today-14', 'future']);
  assert.strictEqual(C.taskDueLabel(t({ due: '2026-10-30' }), TODAY), 'באיחור 3 ימים');
  assert.strictEqual(C.taskDueLabel(t({ due: '2026-11-01' }), TODAY), 'באיחור יום');
  assert.strictEqual(C.taskDueLabel(t({ time: '14:00' }), TODAY), 'היום 14:00');
  assert.strictEqual(C.taskDueLabel(t({ due: '2026-11-03' }), TODAY), 'מחר');
  assert.strictEqual(C.taskDueLabel(t({ due: '2026-11-12', time: '09:30' }), TODAY), '12.11 09:30');
  assert.strictEqual(C.isTaskLate(t({ due: '2026-11-01' }), TODAY), true);
  assert.strictEqual(C.isTaskLate(t({}), TODAY), false);
  assert.deepStrictEqual(C.openTasksOf([t({ id: 'a', contactId: 'C1' }), t({ id: 'b', contactId: 'C2' }),
    t({ id: 'c', contactId: 'C1', done: 'x' })], 'C1').map(x => x.id), ['a']);
  assert.strictEqual(C.validateTask({ text: '', due: TODAY }), 'צריך לכתוב מה המשימה.');
  assert.strictEqual(C.validateTask({ text: 'x', due: '' }), 'צריך לבחור תאריך.');
  assert.strictEqual(C.validateTask({ text: 'x', due: TODAY, time: '25:00' }), 'השעה לא תקינה.');
  assert.strictEqual(C.validateTask({ text: 'x', due: TODAY, time: '' }), '');
  assert.strictEqual(C.taskMatchesQuery(t({ text: 'להביא דוגמאות' }), mk({}), 'הגפן'), true);
  assert.strictEqual(C.taskMatchesQuery(t({ text: 'להביא דוגמאות' }), null, 'דוגמ'), true);
  assert.strictEqual(C.taskMatchesQuery(t({ text: 'להביא דוגמאות' }), null, 'הגפן'), false);
  assert.strictEqual(C.taskMatchesQuery(t({ text: 'x' }), null, '  '), true);
});

test('תוצאה "הזמין": נרשמת כהזמנה; ובלי רישום — רק הערוץ', () => {
  let r = C.applyOutcome(mk({}), 'ordered', 'call', TODAY, null, 'בטלפון');
  assert.deepStrictEqual(r.fields, { stage: 'לקוח', followUp: '' });
  assert.deepStrictEqual(r.activity, { type: 'הזמנה', text: 'דרך שיחה — בטלפון' });
  r = C.applyOutcome(mk({}), 'ordered', 'whatsapp', TODAY, null, '', false);
  assert.deepStrictEqual(r.activity, { type: 'וואטסאפ', text: 'הזמין' });
  const acts = [{ contactId: 'C1', type: 'הזמנה', at: TODAY + ' 09:00', by: 'עמוד', orderId: '' }];
  assert.strictEqual(C.orderOn(acts, 'C1', TODAY), true);
  assert.strictEqual(C.orderOn(acts, 'C1', '2026-11-01'), false);
  assert.strictEqual(C.isManualOrder(acts[0]), true);
  assert.strictEqual(C.isManualOrder(Object.assign({}, acts[0], { orderId: 'AR-1' })), false);
});
```

- [ ] **Step 2: להריץ ולוודא שהבדיקות נכשלות**

Run: `node tools/test/crm-page.test.js`
Expected: ארבע החדשות נכשלות (`C.ordersLine is not a function` וכו'). ‏15 הקיימות עוברות.

- [ ] **Step 3: לממש**

ב-`crm-f428d7/crm-core.js`:

(א) להחליף את `FILTERS`:

```js
    var FILTERS = [
        { key: 'todo', label: 'לטיפול' },
        { key: 'tasks', label: 'משימות' },
        { key: 'late', label: 'לא הזמינו' },
        { key: 'חדש', label: 'חדש' },
        { key: 'חזרתי', label: 'חזרתי' },
        { key: 'נשלחה הצעה', label: 'נשלחה הצעה' },
        { key: 'לקוח', label: 'לקוח' },
        { key: 'לא רלוונטי', label: 'לא רלוונטי' },
        { key: 'all', label: 'הכל' }
    ];
```

(ב) להחליף את `sortContacts`, ‏`filterContacts` ו-`counts`:

```js
    // "לטיפול": חדשים (החדש למעלה), באיחור (הישן למעלה), של היום. "לא הזמינו": המאחר ביותר
    // למעלה. אחרים: פעולה אחרונה
    function sortContacts(list, filter, today) {
        return list.slice().sort(function (a, b) {
            if (filter === 'late') return (Number(b.lateBy) || 0) - (Number(a.lateBy) || 0);
            if (filter === 'todo') {
                var ga = todoGroup(a, today), gb = todoGroup(b, today);
                if (ga !== gb) return ga - gb;
                if (ga === 0) return cmp(b.created, a.created);
                if (ga === 1) return cmp(a.followUp, b.followUp);
            }
            return cmp(b.lastActivity || b.created, a.lastActivity || a.created);
        });
    }
    function filterContacts(contacts, filter, query, today) {
        var list = contacts.filter(function (c) {
            if (!matchesQuery(c, query)) return false;
            if (filter === 'todo') return isTodo(c, today);
            if (filter === 'late') return !!c.isLate;
            if (filter === 'tasks') return false;
            if (filter === 'all') return true;
            return c.stage === filter;
        });
        return sortContacts(list, filter, today);
    }
    // "לטיפול" סופר אנשי קשר ומשימות שהגיע זמנן
    function counts(contacts, today, tasks) {
        var open = tasks || [];
        var r = { todo: dueTasks(open, today).length, all: contacts.length, tasks: open.length, late: 0 };
        STAGES.forEach(function (s) { r[s] = 0; });
        contacts.forEach(function (c) {
            if (r[c.stage] != null) r[c.stage]++;
            if (isTodo(c, today)) r.todo++;
            if (c.isLate) r.late++;
        });
        return r;
    }
```

(ב2) להחליף את `subLine`:

```js
    // ordersView ("לקוח" ו"לא הזמינו"): "הזמנה אחרונה לפני N ימים" במקום תאריך הפעולה האחרונה
    function subLine(c, today, ordersView) {
        var parts = [];
        if (c.business && c.name) parts.push(c.name);
        if (c.source) parts.push(c.source);
        var when = (ordersView && orderSubLine(c)) ||
            relativeDay(String(c.lastActivity || c.created || '').slice(0, 10), today);
        if (when) parts.push(when);
        return parts.join(' · ');
    }
```

(ג) ב-`applyOutcome`, להחליף את החתימה ואת ענף `ordered`:

```js
    function applyOutcome(c, key, channel, today, follow, note, recordOrder) {
```

```js
        } else if (key === 'ordered') {
            fields.stage = 'לקוח';
            fields.followUp = '';
            // "הזמין" — הזמנה לכל דבר; בלי רישום (כבר יש הזמנה היום) — רק הערוץ, כמו קודם
            if (recordOrder !== false) {
                return {
                    fields: fields,
                    activity: { type: 'הזמנה', text: 'דרך ' + (CHANNELS[channel] || 'שיחה') + (note ? ' — ' + note : '') }
                };
            }
        } else if (key === 'not_relevant') {
```

(ד) לפני `// ---------- טופס ----------`, להוסיף:

```js
    // ---------- הזמנות וקצב ----------

    function sinceLabel(n) {
        if (n === 0) return 'היום';
        if (n === 1) return 'אתמול';
        return 'לפני ' + n + ' ימים';
    }
    // "4 הזמנות · אחרונה לפני 52 ימים · בדרך כלל כל 30 יום"
    function ordersLine(c) {
        var n = Number(c.orders) || 0;
        if (!n || c.daysSinceOrder == null || c.daysSinceOrder === '') return 'אין הזמנה רשומה';
        var parts = [n === 1 ? 'הזמנה אחת' : n + ' הזמנות', 'אחרונה ' + sinceLabel(Number(c.daysSinceOrder))];
        var r = Number(c.rhythm) || 0;
        if (r) parts.push('בדרך כלל כל ' + r + (r <= 10 ? ' ימים' : ' יום'));
        return parts.join(' · ');
    }
    function lateLabel(c) {
        if (!c.isLate) return '';
        var n = Number(c.lateBy) || 0;
        return n === 1 ? 'מאחר ביום' : 'מאחר ב-' + n + ' ימים';
    }
    // בשורות של "לקוח" ו"לא הזמינו"
    function orderSubLine(c) {
        if (c.daysSinceOrder == null || c.daysSinceOrder === '') return '';
        return 'הזמנה אחרונה ' + sinceLabel(Number(c.daysSinceOrder));
    }
    function orderOn(activities, contactId, day) {
        return activities.some(function (a) {
            return a.contactId === contactId && a.type === 'הזמנה' && String(a.at).slice(0, 10) === day;
        });
    }
    // רק הזמנה שנרשמה מהעמוד ואין לה מספר אפשר לבטל
    function isManualOrder(a) { return a.type === 'הזמנה' && a.by === 'עמוד' && !a.orderId; }

    // ---------- משימות ----------

    function isTaskDue(t, today) { return !t.done && t.due <= today; }
    function isTaskLate(t, today) { return !t.done && t.due < today; }
    // לפי תאריך; באותו יום — בלי שעה קודם, ואחריהן לפי השעה
    function sortTasks(tasks) {
        return tasks.slice().sort(function (a, b) {
            if (a.due !== b.due) return cmp(a.due, b.due);
            if (!a.time !== !b.time) return a.time ? 1 : -1;
            return cmp(a.time, b.time);
        });
    }
    function dueTasks(tasks, today) {
        return sortTasks((tasks || []).filter(function (t) { return isTaskDue(t, today); }));
    }
    function openTasksOf(tasks, contactId) {
        return sortTasks((tasks || []).filter(function (t) { return !t.done && t.contactId === contactId; }));
    }
    function taskDueLabel(t, today) {
        var time = t.time ? ' ' + t.time : '';
        if (t.due < today) {
            var n = daysBetween(t.due, today);
            return n === 1 ? 'באיחור יום' : 'באיחור ' + n + ' ימים';
        }
        if (t.due === today) return 'היום' + time;
        if (t.due === addDays(today, 1)) return 'מחר' + time;
        return formatDate(t.due) + time;
    }
    function validateTask(input) {
        if (!String(input.text || '').trim()) return 'צריך לכתוב מה המשימה.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.due || ''))) return 'צריך לבחור תאריך.';
        if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return 'השעה לא תקינה.';
        return '';
    }
    // חיפוש במשימות: הטקסט או שם הלקוח
    function taskMatchesQuery(t, contact, query) {
        var q = String(query || '').trim().toLowerCase();
        if (!q) return true;
        return (t.text + ' ' + (contact ? displayName(contact) : '')).toLowerCase().indexOf(q) >= 0;
    }
```

(ה) להחליף את האובייקט `CrmCore`:

```js
    var CrmCore = {
        STAGES: STAGES, FILTERS: FILTERS, MANUAL_SOURCES: MANUAL_SOURCES, CHANNELS: CHANNELS,
        OUTCOMES: OUTCOMES, ymd: ymd, addDays: addDays, daysBetween: daysBetween,
        formatDate: formatDate, formatStamp: formatStamp, relativeDay: relativeDay,
        nowStamp: nowStamp, normalizePhone: normalizePhone, formatPhone: formatPhone,
        waLink: waLink, agentLink: agentLink, displayName: displayName, stageSlug: stageSlug,
        isTodo: isTodo, isOverdue: isOverdue, filterContacts: filterContacts, counts: counts,
        followUpFor: followUpFor, followUpValue: followUpValue, followUpLabel: followUpLabel,
        subLine: subLine, outcomesFor: outcomesFor, applyOutcome: applyOutcome,
        findByPhone: findByPhone, validateNew: validateNew, importLines: importLines,
        ordersLine: ordersLine, lateLabel: lateLabel, orderSubLine: orderSubLine, orderOn: orderOn,
        isManualOrder: isManualOrder, isTaskDue: isTaskDue, isTaskLate: isTaskLate, sortTasks: sortTasks,
        dueTasks: dueTasks, openTasksOf: openTasksOf, taskDueLabel: taskDueLabel, validateTask: validateTask,
        taskMatchesQuery: taskMatchesQuery
    };
```

- [ ] **Step 4: להריץ ולוודא שהכל עובר**

Run: `node tools/test/crm-page.test.js`
Expected: `כל 19 הבדיקות עברו`.

- [ ] **Step 5: Commit**

```bash
git add crm-f428d7/crm-core.js tools/test/crm-page.test.js
git commit -m "$(printf 'CRM: לוגיקת העמוד — לא הזמינו, משימות, ו"הזמין" נספר כהזמנה\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 5: העמוד — הזמנות בכרטיס, משימות וחלונות, ובדיקה בדפדפן

**Files:**
- Modify: `crm-f428d7/index.html`, `crm-f428d7/crm.js`, `crm-f428d7/crm.css`
- Modify (full rewrite): `tools/test/crm-fake-api.js`

**Interfaces:**
- Consumes:
  - Contracts.
  - מ-Task 4: `CrmCore.ordersLine`, `lateLabel`, `subLine(c, today, ordersView)`, `orderOn`, `isManualOrder`, `dueTasks`, `sortTasks`, `openTasksOf`, `taskDueLabel`, `isTaskLate`, `validateTask`, `taskMatchesQuery`, `counts(…, tasks)`, `applyOutcome(…, recordOrder)`.
- Produces: העמוד המעודכן.

- [ ] **Step 1: השרת המדומה — לכתוב מחדש את `tools/test/crm-fake-api.js`**

```js
/* שרת מדומה לעמוד ה-CRM — לבדיקה בדפדפן בלבד, בלי לגעת בענן ובלי נתוני אמת.
   tools/ לא מוגש באתר החי (_config.yml), אבל השרת המקומי מגיש אותו.
   שימוש — בקונסול של http://localhost:8085/crm-f428d7/ לפני הכניסה:
     await new Promise(r => { const s = document.createElement('script');
       s.src = '/tools/test/crm-fake-api.js'; s.onload = r; document.head.appendChild(s); });
   ואז להיכנס עם הסיסמה test-password-1234.
   מתגים: window.__crmFailNext = true (הבקשה הבאה שאינה list נכשלת),
   window.__crmOffline = true (כשל רשת), window.__crmCalls (כל הבקשות).
   הקצב והאיחור מחושבים כמו lateInfo_ בסקריפט, כדי שרישום וביטול הזמנה ישנו את התצוגה. */
(function () {
    const PASSWORD = 'test-password-1234';
    const pad = (n) => (n < 10 ? '0' : '') + n;
    const day = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    };
    const at = (offset, hm) => day(offset) + ' ' + (hm || '09:00');
    const today = day(0);
    let seq = 100;
    const nextId = (p) => p + (seq++);
    const order = (id, contactId, offset, orderId) => ({ id, contactId, at: at(offset), type: 'הזמנה',
        text: '10 פריטים', orderId: orderId || '', pdf: '', quoteLink: '', by: orderId ? 'הזמנות' : 'עמוד' });

    const db = {
        contacts: [
            { id: 'C1', name: 'משה', business: 'מוסך הגליל', phone: '0547781203', email: '', address: '',
              stage: 'חדש', followUp: today, source: 'מודעה בפייסבוק', created: at(0, '08:10'),
              lastActivity: at(0, '08:10'), orders: '0', lastOrder: '' },
            { id: 'C2', name: 'יוסי כהן', business: 'מ.ל. הנדסה', phone: '0501234567', email: 'yossi@example.co.il',
              address: '', stage: 'חדש', followUp: today, source: 'בקשת הצעת מחיר', created: at(-1, '16:20'),
              lastActivity: at(-1, '16:20'), orders: '0', lastOrder: '' },
            { id: 'C3', name: 'אבי', business: 'מחסני דרום', phone: '0529876543', email: '', address: '',
              stage: 'נשלחה הצעה', followUp: day(-2), source: 'טלפון', created: at(-9), lastActivity: at(-5),
              orders: '0', lastOrder: '' },
            { id: 'C4', name: 'מיכל', business: 'בית קפה השקד', phone: '0523334444', email: '', address: '',
              stage: 'חזרתי', followUp: today, source: 'וואטסאפ', created: at(-6), lastActivity: at(-3),
              orders: '0', lastOrder: '' },
            { id: 'C5', name: 'רותי', business: 'גן שושנים', phone: '035551234', email: '',
              address: 'הרצל 4, קריית אונו', stage: 'לקוח', followUp: today, source: 'הזמנה מהאתר',
              created: at(-60), lastActivity: at(-30), orders: '1', lastOrder: day(-30) },
            { id: 'C6', name: 'דוד', business: 'משרדי אלפא', phone: '0541112222', email: '', address: '',
              stage: 'לקוח', followUp: day(20), source: 'ייבוא', created: at(-80), lastActivity: at(-10),
              orders: '1', lastOrder: day(-10) },
            { id: 'C7', name: 'נועה', business: '', phone: '0549998888', email: '', address: '',
              stage: 'לא רלוונטי', followUp: '', source: 'אחר', created: at(-15), lastActivity: at(-14),
              orders: '0', lastOrder: '' },
            { id: 'C8', name: 'שמעון', business: 'מאפיית הכיכר', phone: '0545556666', email: '', address: '',
              stage: 'לקוח', followUp: '', source: 'ייבוא', created: at(-120), lastActivity: at(-50),
              orders: '3', lastOrder: day(-50) }
        ],
        activities: [
            { id: 'A1', contactId: 'C1', at: at(0, '08:10'), type: 'נוצר ידנית',
              text: 'מחפש ספק לנייר וחומרי ניקוי', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' },
            { id: 'A2', contactId: 'C2', at: at(-1, '16:20'), type: 'בקשת הצעת מחיר', text: '12 פריטים',
              orderId: 'HM-' + day(-1).replace(/-/g, '') + '-482911',
              pdf: 'https://drive.google.com/file/d/example/view',
              quoteLink: 'https://aroam.co.il/agent/?cart=' + encodeURIComponent('חדפ003') + ':2&customer=' +
                encodeURIComponent('מ.ל. הנדסה'), by: 'הזמנות' },
            { id: 'A3', contactId: 'C3', at: at(-5), type: 'הצעת מחיר', text: 'שלחתי הצעת מחיר',
              orderId: '', pdf: '', quoteLink: '', by: 'עמוד' },
            { id: 'A4', contactId: 'C5', at: at(-30), type: 'הזמנה', text: '18 פריטים',
              orderId: 'AR-' + day(-30).replace(/-/g, '') + '-123456',
              pdf: 'https://drive.google.com/file/d/example2/view', quoteLink: '', by: 'הזמנות' },
            order('A5', 'C6', -10, 'SL-' + day(-10).replace(/-/g, '') + '-654321'),
            order('A6', 'C8', -100, 'AR-' + day(-100).replace(/-/g, '') + '-111111'),
            order('A7', 'C8', -70, 'AR-' + day(-70).replace(/-/g, '') + '-222222'),
            order('A8', 'C8', -50, 'AR-' + day(-50).replace(/-/g, '') + '-333333')
        ],
        tasks: [
            { id: 'T1', contactId: 'C4', text: 'לשלוח דוגמאות של כוסות נייר', due: today, time: '',
              done: '', created: at(-1), reminded: '' },
            { id: 'T2', contactId: '', text: 'להזמין נייר מהספק', due: day(-1), time: '',
              done: '', created: at(-2), reminded: '' },
            { id: 'T3', contactId: 'C1', text: 'להתקשר אחרי הפגישה', due: today, time: '15:00',
              done: '', created: at(-1), reminded: '' },
            { id: 'T4', contactId: '', text: 'ספירת מלאי', due: day(3), time: '',
              done: '', created: at(-1), reminded: '' }
        ]
    };
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const phoneOf = (raw) => window.CrmCore.normalizePhone(raw);
    const stamp = () => window.CrmCore.nowStamp();
    const dnum = (s) => {
        const p = String(s).slice(0, 10).split('-');
        return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000;
    };
    const between = (a, b) => Math.round(dnum(b) - dnum(a));

    // אותו חישוב כמו lateInfo_ בסקריפט
    function lateFor(c) {
        const days = Array.from(new Set(db.activities
            .filter(a => a.contactId === c.id && a.type === 'הזמנה')
            .map(a => a.at.slice(0, 10)))).sort();
        const info = { rhythm: 0, daysSinceOrder: null, lateBy: 0, isLate: false };
        if (!days.length) return info;
        const ev = [];
        days.forEach(d => { if (!ev.length || between(ev[ev.length - 1], d) > 3) ev.push(d); });
        if (ev.length >= 3) {
            const g = [];
            for (let i = 1; i < ev.length; i++) g.push(between(ev[i - 1], ev[i]));
            g.sort((x, y) => x - y);
            const m = g.length;
            info.rhythm = Math.round(m % 2 ? g[(m - 1) / 2] : (g[m / 2 - 1] + g[m / 2]) / 2);
        }
        info.daysSinceOrder = between(days[days.length - 1], today);
        if (c.stage !== 'לקוח' || (c.followUp && c.followUp > today)) return info;
        const th = info.rhythm ? Math.max(Math.round(info.rhythm * 1.5), info.rhythm + 7) : 45;
        if (info.daysSinceOrder > th) {
            info.isLate = true;
            info.lateBy = info.daysSinceOrder - (info.rhythm || 45);
        }
        return info;
    }
    const withLate = (c) => Object.assign(clone(c), lateFor(c));
    function recount(c) {
        const mine = db.activities.filter(a => a.contactId === c.id && a.type === 'הזמנה');
        c.orders = String(mine.length);
        c.lastOrder = mine.reduce((m, a) => (a.at.slice(0, 10) > m ? a.at.slice(0, 10) : m), '');
    }

    function handle(b) {
        if (b.password !== PASSWORD) return { ok: false, error: 'unauthorized' };
        if (window.__crmFailNext && b.action !== 'list') {
            window.__crmFailNext = false;
            return { ok: false, error: 'server error' };
        }
        const c = b.id ? db.contacts.find(x => x.id === b.id) : null;
        switch (b.action) {
            case 'list':
                return { ok: true, today: today, contacts: db.contacts.map(withLate),
                    activities: clone(db.activities), tasks: clone(db.tasks.filter(t => !t.done)) };
            case 'add': {
                const input = b.contact || {};
                const phone = phoneOf(input.phone);
                if (!phone) return { ok: false, error: 'bad phone' };
                const dup = db.contacts.find(x => x.phone === phone);
                if (dup) return { ok: false, error: 'duplicate', id: dup.id };
                const nc = { id: nextId('C'), name: input.name || '', business: input.business || '', phone: phone,
                    email: '', address: '', stage: 'חדש', followUp: input.followUp || '', source: input.source || 'אחר',
                    created: stamp(), lastActivity: stamp(), orders: '0', lastOrder: '' };
                const a = { id: nextId('A'), contactId: nc.id, at: stamp(), type: 'נוצר ידנית',
                    text: input.note || '', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' };
                db.contacts.push(nc);
                db.activities.push(a);
                return { ok: true, contact: withLate(nc), activity: clone(a) };
            }
            case 'update':
            case 'log': {
                if (!c) return { ok: false, error: 'not found' };
                const f = Object.assign({}, b.fields || {});
                if ('phone' in f) {
                    const p = phoneOf(f.phone);
                    const other = p && db.contacts.find(x => x.phone === p && x.id !== c.id);
                    if (other) return { ok: false, error: 'duplicate', id: other.id };
                    f.phone = p;
                }
                Object.assign(c, f);
                let a = null;
                if (b.activity) {
                    a = { id: nextId('A'), contactId: c.id, at: stamp(), type: b.activity.type,
                        text: b.activity.text || '', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' };
                    db.activities.push(a);
                    c.lastActivity = a.at;
                    if (a.type === 'הזמנה') recount(c);
                }
                return { ok: true, contact: withLate(c), activity: a ? clone(a) : null };
            }
            case 'delete': {
                if (!c) return { ok: false, error: 'not found' };
                const n = db.activities.filter(a => a.contactId === c.id).length;
                db.activities = db.activities.filter(a => a.contactId !== c.id);
                db.tasks = db.tasks.filter(t => t.contactId !== c.id);
                db.contacts = db.contacts.filter(x => x.id !== c.id);
                return { ok: true, deleted: n };
            }
            case 'import':
                return { ok: true, dryRun: b.dryRun !== false, summary: { rows: 75, created: 2, updated: 1,
                    activities: 3, skipped: { chain: 63, committee: 0, consumer: 5, test: 2, noKey: 0,
                    unknown: 0, existing: 0 }, testRows: ['AR-20260820-4449 — רועי בדיקה',
                    'SL-20260822-4481 — לקוח בדיקה'] } };
            case 'order': {
                if (!c) return { ok: false, error: 'not found' };
                const o = b.order || {};
                const d = o.date || today;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today) return { ok: false, error: 'bad date' };
                const a = { id: nextId('A'), contactId: c.id, at: d === today ? stamp() : d + ' 12:00',
                    type: 'הזמנה', text: o.note || '', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' };
                db.activities.push(a);
                c.stage = 'לקוח';
                c.followUp = '';
                c.lastActivity = stamp();
                recount(c);
                return { ok: true, contact: withLate(c), activity: clone(a) };
            }
            case 'order_cancel': {
                const a = db.activities.find(x => x.id === b.activityId);
                if (!a) return { ok: false, error: 'not found' };
                if (a.type !== 'הזמנה' || a.by !== 'עמוד' || a.orderId) return { ok: false, error: 'not cancellable' };
                db.activities = db.activities.filter(x => x !== a);
                const owner = db.contacts.find(x => x.id === a.contactId);
                if (!owner) return { ok: true };
                recount(owner);
                return { ok: true, contact: withLate(owner) };
            }
            case 'task_add': {
                const t = b.task || {};
                if (!String(t.text || '').trim()) return { ok: false, error: 'text required' };
                if (!/^\d{4}-\d{2}-\d{2}$/.test(t.due || '')) return { ok: false, error: 'bad date' };
                if (t.contactId && !db.contacts.find(x => x.id === t.contactId)) return { ok: false, error: 'not found' };
                const nt = { id: nextId('T'), contactId: t.contactId || '', text: String(t.text).trim(), due: t.due,
                    time: t.time || '', done: '', created: stamp(), reminded: '' };
                db.tasks.push(nt);
                return { ok: true, task: clone(nt) };
            }
            case 'task_update': {
                const t = db.tasks.find(x => x.id === b.id);
                if (!t) return { ok: false, error: 'not found' };
                const f = b.fields || {};
                ['text', 'due', 'time'].forEach(k => { if (k in f) t[k] = f[k]; });
                const res = { ok: true };
                const owner = t.contactId ? db.contacts.find(x => x.id === t.contactId) : null;
                if (f.done === true && !t.done) {
                    t.done = stamp();
                    if (owner) {
                        const a = { id: nextId('A'), contactId: owner.id, at: stamp(), type: 'משימה',
                            text: 'בוצעה: ' + t.text, orderId: '', pdf: '', quoteLink: '', by: 'עמוד' };
                        db.activities.push(a);
                        owner.lastActivity = a.at;
                        res.activity = clone(a);
                    }
                } else if (f.done === false && t.done) {
                    t.done = '';
                    if (owner) {
                        const hit = db.activities.slice().reverse().find(a => a.contactId === owner.id &&
                            a.type === 'משימה' && a.text === 'בוצעה: ' + t.text);
                        if (hit) {
                            db.activities = db.activities.filter(a => a !== hit);
                            res.removedActivityId = hit.id;
                        }
                    }
                }
                res.task = clone(t);
                if (owner) res.contact = withLate(owner);
                return res;
            }
            case 'task_delete': {
                const n = db.tasks.length;
                db.tasks = db.tasks.filter(x => x.id !== b.id);
                return db.tasks.length < n ? { ok: true } : { ok: false, error: 'not found' };
            }
        }
        return { ok: false, error: 'unknown action' };
    }

    const realFetch = window.fetch.bind(window);
    window.__crmCalls = [];
    window.fetch = async function (url, init) {
        let body = null;
        try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { body = null; }
        if (!body || !body.action) return realFetch(url, init);
        window.__crmCalls.push(body);
        await new Promise(r => setTimeout(r, 120));
        if (window.__crmOffline) throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify(handle(body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    console.log('crm-fake-api: פעיל. סיסמה: ' + PASSWORD);
})();
```

- [ ] **Step 2: index.html**

ב-`crm-f428d7/index.html`:

(א) גרסאות:

```html
    <link rel="stylesheet" href="crm.css?v=3">
```

```html
    <script src="crm-core.js?v=2"></script>
    <script src="crm.js?v=3"></script>
```

(ב) כפתור "+ משימה", לפני "+ ליד":

```html
                <div class="crm-bar-actions">
                    <button type="button" id="crm-task-add-btn" class="crm-bar-btn">+ משימה</button>
                    <button type="button" id="crm-add-btn" class="crm-bar-btn">+ ליד</button>
```

(ג) תיאור קבוצת הסינון — עכשיו היא לא רק לפי שלב:

```html
                    <div id="crm-filters" class="crm-filters" role="group" aria-label="סינון"></div>
```

(ד) בין `crm-banner` לבין `crm-list`:

```html
                <p id="crm-banner" class="crm-banner" role="status" hidden></p>
                <section id="crm-tasks-block" class="crm-tasks-block" aria-labelledby="crm-tasks-head" hidden>
                    <h2 id="crm-tasks-head" class="crm-section">משימות</h2>
                    <ul id="crm-task-list" class="crm-list crm-task-list"></ul>
                </section>
                <h2 id="crm-contacts-head" class="crm-section" hidden>לחזור</h2>
                <ul id="crm-list" class="crm-list"></ul>
```

(ה) שני חלונות חדשים, אחרי `crm-import`:

```html
    <div id="crm-order-wrap" class="crm-overlay" hidden>
        <form id="crm-order-form" class="crm-sheet" role="dialog" aria-modal="true" aria-labelledby="crm-order-title" novalidate>
            <h2 id="crm-order-title" tabindex="-1">רישום הזמנה</h2>
            <p class="crm-label" id="o-date-label">מתי?</p>
            <div id="o-date-chips" class="crm-chips" role="group" aria-labelledby="o-date-label"></div>
            <input type="date" id="o-date" class="crm-input crm-date" aria-label="תאריך ההזמנה">
            <div id="o-dup" class="crm-dup" role="status" hidden></div>
            <label for="o-note" class="crm-label">הערה (לא חובה)</label>
            <input type="text" id="o-note" class="crm-input" maxlength="200" autocomplete="off">
            <p id="o-error" class="crm-error" role="alert"></p>
            <div class="crm-form-actions">
                <button type="submit" id="o-submit" class="crm-btn crm-btn-primary">רישום</button>
                <button type="button" id="o-cancel" class="crm-btn">ביטול</button>
            </div>
        </form>
    </div>

    <div id="crm-task-wrap" class="crm-overlay" hidden>
        <form id="crm-task-form" class="crm-sheet" role="dialog" aria-modal="true" aria-labelledby="crm-task-title" novalidate>
            <h2 id="crm-task-title" tabindex="-1"></h2>
            <p id="t-for" class="crm-card-meta" hidden></p>
            <label for="t-text" class="crm-label">משימה *</label>
            <textarea id="t-text" class="crm-input" rows="2" maxlength="300"></textarea>
            <p class="crm-label" id="t-date-label">מתי?</p>
            <div id="t-date-chips" class="crm-chips" role="group" aria-labelledby="t-date-label"></div>
            <input type="date" id="t-date" class="crm-input crm-date" aria-label="תאריך המשימה">
            <label for="t-time" class="crm-label">שעה (לא חובה — עם שעה מגיעה תזכורת בטלגרם)</label>
            <input type="time" id="t-time" class="crm-input crm-date">
            <button type="button" id="t-delete" class="crm-btn crm-btn-danger" hidden>מחיקת המשימה</button>
            <p id="t-error" class="crm-error" role="alert"></p>
            <div class="crm-form-actions">
                <button type="submit" id="t-submit" class="crm-btn crm-btn-primary">שמירה</button>
                <button type="button" id="t-cancel" class="crm-btn">ביטול</button>
            </div>
        </form>
    </div>
```

(ו) ההודעה הצפה עם מקום לכפתור:

```html
    <div id="crm-toast" class="crm-toast" role="status" aria-live="polite">
        <span id="crm-toast-text"></span>
        <button type="button" id="crm-toast-action" class="crm-toast-action" hidden></button>
    </div>
```

- [ ] **Step 3: crm.css — להוסיף לפני `/* --- הודעה צפה --- */`**

```css
/* --- פס עליון בטלפון צר: שלושה כפתורים בלי לחתוך את הכותרת --- */
@media (max-width: 400px) {
    .crm-bar { padding-inline: 0.75rem; }
    .crm-bar-btn:not(.crm-icon-btn) { padding-inline: 0.65rem; }
}

/* --- משימות --- */
.crm-section { margin: 0.9rem 1rem 0.3rem; font-size: 0.85rem; font-weight: 700; color: var(--crm-muted); }
.crm-task-list { margin: 0.25rem 0 0.5rem; }
.crm-task-row { align-items: flex-start; }
.crm-check {
    flex: none; width: 40px; height: 40px; margin-top: 0.3rem;
    display: inline-flex; align-items: center; justify-content: center;
    border: 2px solid var(--crm-muted); border-radius: 8px;
    background: var(--crm-surface); color: transparent; cursor: pointer;
}
.crm-check svg { width: 20px; height: 20px; }
.crm-check:hover, .crm-check:focus-visible { color: var(--crm-primary); border-color: var(--crm-primary); }
.crm-task-body { flex: 1; min-width: 0; display: grid; }
.crm-task-text { white-space: normal; overflow-wrap: anywhere; }
.crm-task-who { justify-self: start; padding: 0 0 0.45rem; font-size: 0.88rem; }
.crm-card-tasks .crm-task-list .crm-task-row {
    border: 1px solid var(--crm-border); border-radius: 8px; margin-bottom: 0.4rem;
}

/* --- הזמנות בכרטיס --- */
.crm-orders { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.crm-orders h2, .crm-orders-line { flex: 1 1 100%; margin-bottom: 0; }
.crm-late-tag { font-size: 0.88rem; font-weight: 700; color: var(--crm-late); }
.crm-btn-small { min-height: 40px; padding: 0.45rem 0.9rem; }
.crm-cancel-order { justify-self: start; padding: 0.25rem 0; font-size: 0.88rem; }

/* --- הודעה עם פעולה --- */
.crm-toast { display: flex; align-items: center; gap: 0.75rem; }
.crm-toast-action {
    background: none; border: 1px solid currentColor; border-radius: 6px; color: inherit;
    padding: 0.3rem 0.8rem; min-height: 36px; font: inherit; font-weight: 700; cursor: pointer;
}
```

- [ ] **Step 4: crm.js — שינויים בקוד הקיים**

ב-`crm-f428d7/crm.js`:

(א) בהערת הראש, אחרי שורת האפיון:

```js
   אפיון: docs/superpowers/specs/2026-11-02-crm-design.md
          docs/superpowers/specs/2026-11-03-crm-orders-tasks-notifications-design.md */
```

(ב) ב-`ICONS`, שורה חדשה אחרי `quote` — ושורת `quote` הקיימת מקבלת פסיק בסוף:

```js
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-11"/></svg>'
```

(ג) ב-`ERRORS`, אחרי השורה הקיימת של `'not found'` (שמקבלת פסיק בסוף):

```js
        'bad date': 'התאריך לא תקין.',
        'bad time': 'השעה לא תקינה.',
        'text required': 'צריך לכתוב מה המשימה.',
        'not cancellable': 'אפשר לבטל רק הזמנה שנרשמה כאן ידנית.'
```

(ד) להחליף את `S`:

```js
    const S = {
        password: '', contacts: [], activities: [], tasks: [], filter: 'todo', query: '',
        today: C.ymd(new Date()), loadedAt: 0, openId: null,
        outcome: null, form: null, orderForm: null, taskForm: null, afterPop: null, lastFocus: null
    };
```

(ה) ב-`logout`, אחרי `S.activities = [];`:

```js
        S.tasks = [];
```

(ו) ב-`applyList`, אחרי `S.activities = …`:

```js
        S.tasks = data.tasks || [];
```

(ז) ב-`renderFilters`:

```js
        const counts = C.counts(S.contacts, S.today, S.tasks);
```

(ח) להחליף את השורות מ-`function renderList()` ועד סוף `rowFor` — כולל `badge` שביניהן, שנשארת כמו שהיא:

```js
    function renderList() {
        renderFilters();
        // משימות: ב"לטיפול" — אלה שהגיע זמנן, ב"משימות" — כל הפתוחות. החיפוש חל גם עליהן.
        const base = S.filter === 'tasks' ? C.sortTasks(S.tasks)
            : S.filter === 'todo' ? C.dueTasks(S.tasks, S.today) : [];
        const tasks = base.filter(t => C.taskMatchesQuery(t, t.contactId ? byId(t.contactId) : null, S.query));
        const tl = $('crm-task-list');
        tl.textContent = '';
        tasks.forEach(t => tl.appendChild(taskRow(t, false)));
        $('crm-tasks-block').hidden = !tasks.length;
        const list = C.filterContacts(S.contacts, S.filter, S.query, S.today);
        const ul = $('crm-list');
        ul.textContent = '';
        list.forEach(c => ul.appendChild(rowFor(c)));
        $('crm-contacts-head').hidden = !(tasks.length && list.length);
        const empty = $('crm-empty');
        empty.textContent = S.filter === 'tasks' ? 'אין משימות פתוחות.' : 'אין כאן אף אחד כרגע.';
        empty.hidden = list.length > 0 || tasks.length > 0;
    }

    function badge(stage) { return el('span', 'crm-badge crm-stage-' + C.stageSlug(stage), stage); }

    function rowFor(c) {
        const li = el('li', 'crm-row');
        const main = el('button', 'crm-row-main');
        main.type = 'button';
        const top = el('span', 'crm-row-top');
        top.appendChild(el('span', 'crm-row-title', C.displayName(c)));
        top.appendChild(badge(c.stage));
        main.appendChild(top);
        // ב"לקוח" וב"לא הזמינו" — כמה זמן עבר מההזמנה האחרונה, ותג האיחור
        const ordersView = S.filter === 'לקוח' || S.filter === 'late';
        const sub = C.subLine(c, S.today, ordersView);
        if (sub) main.appendChild(el('span', 'crm-row-sub', sub));
        const due = [C.followUpLabel(c, S.today), ordersView ? C.lateLabel(c) : ''].filter(Boolean).join(' · ');
        if (due) {
            const red = C.isOverdue(c, S.today) || (ordersView && c.isLate);
            main.appendChild(el('span', 'crm-row-due' + (red ? ' is-late' : ''), due));
        }
        main.addEventListener('click', () => openCard(c.id));
        li.appendChild(main);
        li.appendChild(actions(c, true));
        return li;
    }
```

(ט) ב-`renderCard`, להחליף את שלוש השורות האלה — המונה עובר לשורת ההזמנות:

```js
        const orders = Number(c.orders) > 0 ? ' · ' + c.orders + ' הזמנות' : '';
        host.appendChild(el('p', 'crm-card-meta', 'מקור: ' + (c.source || '—') + orders));
        host.appendChild(actions(c, false));
```

באלה:

```js
        host.appendChild(el('p', 'crm-card-meta', 'מקור: ' + (c.source || '—')));
        host.appendChild(actions(c, false));
        host.appendChild(ordersBlock(c));
```

ולפני `host.appendChild(el('h2', 'crm-label', 'היסטוריה'));`:

```js
        host.appendChild(cardTasks(c));
```

(י) ב-`historyItem`, לפני `return li;`:

```js
        // לא על רישום זמני ששמירה אופטימית עוד לא אישרה (מזהה tmp-)
        if (C.isManualOrder(a) && a.id.indexOf('tmp-') !== 0) li.appendChild(cancelOrderButton(a));
```

(יא) להחליף את `finishOutcome`:

```js
    function finishOutcome(key, follow) {
        const o = S.outcome;
        const c = o ? byId(o.id) : null;
        // "הזמין" כשכבר רשומה הזמנה היום — לשאול לפני שנספרת עוד אחת
        if (key === 'ordered' && c && C.orderOn(S.activities, c.id, S.today)) {
            showOrderedChoice();
            return;
        }
        S.outcome = null;
        const note = $('crm-outcome-note').value.trim();
        closeOverlay('crm-outcome');
        if (!c) return;
        const change = C.applyOutcome(c, key, o.channel, S.today, follow, note);
        save(c, change.fields, change.activity);
    }

    function showOrderedChoice() {
        $('crm-outcome-title').textContent = 'כבר רשומה הזמנה מהיום. לרשום הזמנה נוספת?';
        const host = $('crm-outcome-options');
        host.textContent = '';
        [[true, 'כן, הזמנה נוספת'], [false, 'לא, רק לרשום את השיחה']].forEach(([extra, label]) => {
            const b = el('button', 'crm-option', label);
            b.type = 'button';
            b.addEventListener('click', () => finishOrdered(extra));
            host.appendChild(b);
        });
        $('crm-outcome-follow').hidden = true;
        host.firstChild.focus();
    }

    function finishOrdered(extra) {
        const o = S.outcome;
        S.outcome = null;
        const c = o ? byId(o.id) : null;
        const note = $('crm-outcome-note').value.trim();
        closeOverlay('crm-outcome');
        if (!c) return;
        const change = C.applyOutcome(c, 'ordered', o.channel, S.today, null, note, extra);
        save(c, change.fields, change.activity);
    }
```

(יב) להחליף את `toast`:

```js
    let toastTimer = null;
    // הודעה צפה; עם actionLabel — כפתור (למשל "בטל") שנשאר 5 שניות
    function toast(message, actionLabel, onAction) {
        const t = $('crm-toast');
        const b = $('crm-toast-action');
        $('crm-toast-text').textContent = message;
        b.hidden = !actionLabel;
        b.textContent = actionLabel || '';
        b.onclick = actionLabel ? () => {
            t.classList.remove('is-on');
            b.hidden = true;
            onAction();
        } : null;
        t.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            t.classList.remove('is-on');
            b.hidden = true;
        }, actionLabel ? 5000 : 3500);
    }
```

(יג) ב-`init`, אחרי `$('crm-add-btn').addEventListener(…)`:

```js
        $('crm-task-add-btn').addEventListener('click', () => openTaskForm(null, null));
        $('crm-order-form').addEventListener('submit', submitOrder);
        $('o-cancel').addEventListener('click', () => closeOverlay('crm-order-wrap'));
        $('o-date').addEventListener('change', () => {
            const v = $('o-date').value;
            if (!v || !S.orderForm) return;
            setOrderDate(v);
            orderChips(v);
        });
        $('crm-task-form').addEventListener('submit', submitTask);
        $('t-cancel').addEventListener('click', () => closeOverlay('crm-task-wrap'));
        $('t-delete').addEventListener('click', deleteTask);
        $('t-date').addEventListener('change', () => {
            const v = $('t-date').value;
            if (!v || !S.taskForm) return;
            S.taskForm.due = v;
            taskChips(choiceFor(v));
        });
```

- [ ] **Step 5: crm.js — הפונקציות החדשות**

לפני `// ---------- חלון התוצאה ----------`, להוסיף:

```js
    // ---------- הזמנות ----------

    // "4 הזמנות · אחרונה לפני 52 ימים · בדרך כלל כל 30 יום", תג איחור, ורישום הזמנה
    function ordersBlock(c) {
        const wrap = el('div', 'crm-orders');
        wrap.appendChild(el('h2', 'crm-label', 'הזמנות'));
        wrap.appendChild(el('p', 'crm-orders-line', C.ordersLine(c)));
        const late = C.lateLabel(c);
        if (late) wrap.appendChild(el('span', 'crm-late-tag', late));
        const rec = el('button', 'crm-btn crm-btn-small', 'רשום הזמנה');
        rec.type = 'button';
        rec.addEventListener('click', () => openOrderForm(c.id));
        wrap.appendChild(rec);
        return wrap;
    }

    function orderChips(current) {
        chipGroup($('o-date-chips'), [[S.today, 'היום'], [C.addDays(S.today, -1), 'אתמול']], current, setOrderDate);
    }

    function openOrderForm(id) {
        const c = byId(id);
        if (!c) return;
        S.orderForm = { id: id, date: S.today };
        $('crm-order-title').textContent = 'רישום הזמנה — ' + C.displayName(c);
        $('o-note').value = '';
        $('o-error').textContent = '';
        $('o-date').max = S.today;
        orderChips(S.today);
        setOrderDate(S.today);
        openOverlay('crm-order-wrap', 'crm-order-title');
    }

    // כבר רשומה הזמנה באותו תאריך — לשאול לפני שנספרת עוד אחת
    function setOrderDate(day) {
        const f = S.orderForm;
        if (!f) return;
        f.date = day;
        $('o-date').value = day;
        const dup = C.orderOn(S.activities, f.id, day);
        const box = $('o-dup');
        box.hidden = !dup;
        box.textContent = dup ? 'כבר רשומה הזמנה מ-' + C.formatDate(day) + ' — לרשום עוד אחת?' : '';
        $('o-submit').textContent = dup ? 'לרשום עוד אחת' : 'רישום';
    }

    async function submitOrder(e) {
        e.preventDefault();
        const f = S.orderForm;
        if (!f) return;
        $('o-error').textContent = '';
        if (!f.date || f.date > S.today) { $('o-error').textContent = 'אפשר לרשום הזמנה עד היום.'; return; }
        if (offline()) { $('o-error').textContent = ERRORS.network; return; }
        const btn = $('o-submit');
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'שומר…';
        const res = await api('order', { id: f.id, order: { date: f.date, note: $('o-note').value.trim() } });
        btn.disabled = false;
        btn.textContent = label;
        if (!res.ok) { $('o-error').textContent = errorText(res, 'לא נשמר — נסו שוב.'); return; }
        Object.assign(byId(f.id), res.contact);
        if (res.activity) S.activities.push(res.activity);
        S.orderForm = null;
        closeOverlay('crm-order-wrap', rerender);
        toast('ההזמנה נרשמה.');
    }

    // ביטול בשתי לחיצות, כמו מחיקת איש קשר
    function cancelOrderButton(a) {
        const b = el('button', 'crm-link-btn crm-cancel-order', 'בטל');
        b.type = 'button';
        b.setAttribute('aria-label', 'ביטול ההזמנה מ-' + C.formatStamp(a.at));
        let armed = false;
        b.addEventListener('click', async () => {
            if (!armed) {
                armed = true;
                b.textContent = 'בטוח? לחיצה נוספת מבטלת';
                b.setAttribute('aria-label', 'בטוח? לחיצה נוספת מבטלת את ההזמנה');
                setTimeout(() => {
                    armed = false;
                    if (!document.contains(b)) return;
                    b.textContent = 'בטל';
                    b.setAttribute('aria-label', 'ביטול ההזמנה מ-' + C.formatStamp(a.at));
                }, 4000);
                return;
            }
            if (offline()) { toast(ERRORS.network); return; }
            b.disabled = true;
            const res = await api('order_cancel', { activityId: a.id });
            b.disabled = false;
            if (!res.ok) { if (res.error !== 'unauthorized') toast(errorText(res, 'הביטול נכשל.')); return; }
            S.activities = S.activities.filter(x => x.id !== a.id);
            if (res.contact) Object.assign(byId(res.contact.id) || {}, res.contact);
            rerender();
            toast('ההזמנה בוטלה.');
        });
        return b;
    }

    // ---------- משימות ----------

    function taskRow(t, inCard) {
        const li = el('li', 'crm-row crm-task-row');
        const check = el('button', 'crm-check');
        check.type = 'button';
        check.setAttribute('aria-label', 'סימון כבוצעה: ' + t.text);
        check.innerHTML = ICONS.check;
        check.addEventListener('click', () => completeTask(t));
        li.appendChild(check);
        const body = el('div', 'crm-task-body');
        const main = el('button', 'crm-row-main');
        main.type = 'button';
        main.appendChild(el('span', 'crm-row-title crm-task-text', t.text));
        main.appendChild(el('span', 'crm-row-due' + (C.isTaskLate(t, S.today) ? ' is-late' : ''),
            C.taskDueLabel(t, S.today)));
        main.addEventListener('click', () => openTaskForm(t.id, null));
        body.appendChild(main);
        const c = !inCard && t.contactId ? byId(t.contactId) : null;
        if (c) {
            const who = el('button', 'crm-link-btn crm-task-who', C.displayName(c));
            who.type = 'button';
            who.addEventListener('click', () => openCard(c.id));
            body.appendChild(who);
        }
        li.appendChild(body);
        return li;
    }

    function cardTasks(c) {
        const wrap = el('div', 'crm-card-tasks');
        wrap.appendChild(el('h2', 'crm-label', 'משימות'));
        const mine = C.openTasksOf(S.tasks, c.id);
        if (mine.length) {
            const ul = el('ul', 'crm-task-list');
            mine.forEach(t => ul.appendChild(taskRow(t, true)));
            wrap.appendChild(ul);
        }
        const add = el('button', 'crm-btn crm-btn-small', '+ משימה');
        add.type = 'button';
        add.addEventListener('click', () => openTaskForm(null, c.id));
        wrap.appendChild(add);
        return wrap;
    }

    // הסימון מופיע מיד ונשמר ברקע; "בטל" בהודעה פותח את המשימה שוב
    async function completeTask(t) {
        if (offline()) { toast(ERRORS.network); return; }
        const i = S.tasks.indexOf(t);
        if (i >= 0) S.tasks.splice(i, 1);
        rerender();
        const res = await api('task_update', { id: t.id, fields: { done: true } });
        if (!res.ok) {
            S.tasks.push(t);
            rerender();
            if (res.error !== 'unauthorized') toast(errorText(res, 'לא נשמר — נסו שוב.'));
            return;
        }
        if (res.activity) S.activities.push(res.activity);
        if (res.contact) Object.assign(byId(res.contact.id) || {}, res.contact);
        rerender();
        toast('המשימה סומנה כבוצעה.', 'בטל', () => undoTask(t, res.activity ? res.activity.id : null));
    }

    async function undoTask(t, activityId) {
        if (offline()) { toast(ERRORS.network); return; }
        const res = await api('task_update', { id: t.id, fields: { done: false } });
        if (!res.ok) { if (res.error !== 'unauthorized') toast(errorText(res, 'הביטול נכשל.')); return; }
        S.tasks.push(res.task);
        const gone = res.removedActivityId || activityId;
        if (gone) S.activities = S.activities.filter(a => a.id !== gone);
        if (res.contact) Object.assign(byId(res.contact.id) || {}, res.contact);
        rerender();
        toast('המשימה נפתחה שוב.');
    }

    // מפתח הקיצור שהתאריך שלו הוא day (היום, מחר, 3 ימים, שבוע), או null
    function choiceFor(day) {
        const hit = FOLLOW_CHOICES.find(([k]) => C.followUpFor(k, S.today) === day);
        return hit ? hit[0] : null;
    }

    function taskChips(current) {
        chipGroup($('t-date-chips'), FOLLOW_CHOICES, current, (k) => {
            if (!S.taskForm) return;
            S.taskForm.due = C.followUpFor(k, S.today);
            $('t-date').value = S.taskForm.due;
        });
    }

    function openTaskForm(taskId, contactId) {
        const t = taskId ? S.tasks.find(x => x.id === taskId) : null;
        const cid = t ? t.contactId : (contactId || '');
        const c = cid ? byId(cid) : null;
        S.taskForm = { id: t ? t.id : null, contactId: cid, due: t ? t.due : S.today, armed: false };
        $('crm-task-title').textContent = t ? 'עריכת משימה' : 'משימה חדשה';
        $('t-for').hidden = !c;
        $('t-for').textContent = c ? 'על: ' + C.displayName(c) : '';
        $('t-text').value = t ? t.text : '';
        $('t-time').value = t ? t.time : '';
        $('t-date').value = S.taskForm.due;
        $('t-error').textContent = '';
        $('t-delete').hidden = !t;
        $('t-delete').textContent = 'מחיקת המשימה';
        taskChips(choiceFor(S.taskForm.due));
        openOverlay('crm-task-wrap', t ? 'crm-task-title' : 't-text');
    }

    async function submitTask(e) {
        e.preventDefault();
        const f = S.taskForm;
        if (!f) return;
        $('t-error').textContent = '';
        const input = { text: $('t-text').value.trim(), due: f.due, time: $('t-time').value };
        const problem = C.validateTask(input);
        if (problem) { $('t-error').textContent = problem; return; }
        if (offline()) { $('t-error').textContent = ERRORS.network; return; }
        const btn = $('t-submit');
        btn.disabled = true;
        btn.textContent = 'שומר…';
        const res = f.id
            ? await api('task_update', { id: f.id, fields: input })
            : await api('task_add', { task: Object.assign({ contactId: f.contactId }, input) });
        btn.disabled = false;
        btn.textContent = 'שמירה';
        if (!res.ok) { $('t-error').textContent = errorText(res, 'לא נשמר — נסו שוב.'); return; }
        const i = S.tasks.findIndex(x => x.id === res.task.id);
        if (i >= 0) S.tasks[i] = res.task;
        else S.tasks.push(res.task);
        S.taskForm = null;
        closeOverlay('crm-task-wrap', rerender);
        toast(f.id ? 'המשימה עודכנה.' : 'המשימה נוספה.');
    }

    // מחיקה בשתי לחיצות
    async function deleteTask() {
        const f = S.taskForm;
        if (!f || !f.id) return;
        const btn = $('t-delete');
        if (!f.armed) {
            f.armed = true;
            btn.textContent = 'בטוח? לחיצה נוספת מוחקת';
            setTimeout(() => {
                if (S.taskForm === f && f.armed) { f.armed = false; btn.textContent = 'מחיקת המשימה'; }
            }, 4000);
            return;
        }
        btn.disabled = true;
        const res = await api('task_delete', { id: f.id });
        btn.disabled = false;
        if (!res.ok) { $('t-error').textContent = errorText(res, 'המחיקה נכשלה.'); return; }
        S.tasks = S.tasks.filter(x => x.id !== f.id);
        S.taskForm = null;
        closeOverlay('crm-task-wrap', rerender);
        toast('המשימה נמחקה.');
    }
```

- [ ] **Step 6: להריץ את בדיקות Node**

Run:
```bash
node tools/test/crm.test.js && node tools/test/crm-page.test.js && node --check crm-f428d7/crm.js && node --check tools/test/crm-fake-api.js
```
Expected: `כל 64 הבדיקות עברו`, ‏`כל 19 הבדיקות עברו`, ושתי בדיקות התחביר בלי פלט.

- [ ] **Step 7: בדיקה בדפדפן מול השרת המדומה**

1. `preview_start` עם `{ name: "aroam-site" }`, ואז ניווט ל-`http://localhost:8085/crm-f428d7/`.
2. ב-`javascript_tool`: לנקות את ה-service worker ואת המטמונים (`navigator.serviceWorker.getRegistrations()` ← `unregister`, ‏`caches.keys()` ← `delete`), לרענן, ולטעון את השרת המדומה:
   ```js
   await new Promise(r => { const s = document.createElement('script'); s.src = '/tools/test/crm-fake-api.js'; s.onload = r; document.head.appendChild(s); });
   ```
   ולהיכנס עם `test-password-1234`. לוודא ש-`crm.js?v=3` נטען.
3. **מה לבדוק, ובכל סעיף התוצאה המצופה:**
   - **סינונים:** הסדר "לטיפול · משימות · לא הזמינו · חדש …". "לטיפול" סופר 3 משימות שהגיע זמנן (T1, ‏T2, ‏T3). "לא הזמינו" מציג 1 (מאפיית הכיכר, "מאחר ב-25 ימים").
   - **"לטיפול":** קבוצת "משימות" למעלה, בסדר T2 (באיחור יום) ← T1 (היום) ← T3 (היום 15:00), ואחריה הכותרת "לחזור" ואנשי הקשר. לחיצה על "בית קפה השקד" בשורת T1 פותחת את הכרטיס.
   - **סימון משימה:** ✓ על T1 ← השורה נעלמת ומופיעה הודעה עם "בטל". בהיסטוריה של "בית קפה השקד" יש "משימה · בוצעה: …". לחיצה על "בטל" ← המשימה חוזרת והרישום נמחק.
   - **כרטיס "מאפיית הכיכר":** "3 הזמנות · אחרונה לפני 50 ימים · בדרך כלל כל 25 יום" ותג "מאחר ב-25 ימים".
   - **רישום הזמנה:** "רשום הזמנה" ← "היום" ← הערה "בטלפון" ← "רישום". אחר כך: "4 הזמנות · אחרונה היום", התג נעלם, ו"לא הזמינו" יורד ל-0.
   - **רישום שני באותו יום:** "רשום הזמנה" שוב ← הודעה "כבר רשומה הזמנה מ-…" והכפתור "לרשום עוד אחת". "ביטול".
   - **ביטול הזמנה:** בהיסטוריה, "בטל" ליד ההזמנה הידנית ← "בטוח?" ← לחיצה נוספת. ההזמנה נעלמת והמונה חוזר ל-3. ליד ההזמנות שהגיעו עם מספר (`AR-`) אין "בטל".
   - **"הזמין" אחרי שיחה:** ב"משרדי אלפא": "התקשר" ← "הזמין" ← נרשמת "הזמנה · דרך שיחה". "התקשר" ← "הזמין" שוב באותו יום ← השאלה "כבר רשומה הזמנה מהיום…". "לא, רק לרשום את השיחה" ← נרשמת "שיחה · הזמין", והמונה לא עולה.
   - **משימה חדשה מהכרטיס:** "+ משימה", טקסט, "מחר", שעה 10:00 ← שמירה. היא מופיעה בכרטיס ובסינון "משימות" עם "מחר 10:00".
   - **עריכה ומחיקה:** לחיצה על המשימה ← החלון נפתח עם הנתונים. שינוי טקסט ← "המשימה עודכנה". "מחיקת המשימה" ← "בטוח?" ← נמחקת.
   - **משימה כללית:** "+ משימה" מהכותרת, בלי "על:", תאריך מתוך שדה התאריך ← נשמרת בלי איש קשר.
   - **חיפוש:** בסינון "משימות", "דוגמאות" מציג רק את T1, ו"מוסך" מציג את T3 (לפי שם הלקוח). ניקוי החיפוש מחזיר את כולן. ב"לקוח" ו"לא הזמינו" שורת המשנה מסתיימת ב"הזמנה אחרונה לפני N ימים".
   - **ולידציה:** טקסט ריק ← "צריך לכתוב מה המשימה.". שעה לא תקינה (אם הדפדפן מאפשר) ← "השעה לא תקינה.".
   - **כשל שמירה:** `window.__crmFailNext = true` ואז סימון משימה ← המשימה חוזרת והודעה "לא נשמר — נסו שוב.".
   - **מקלדת ו"חזור":** Esc סוגר את חלון ההזמנה ואת חלון המשימה. `history.back()` כשחלון פתוח ← החלון נסגר והעמוד נשאר. Tab מסתובב בתוך החלון.
   - **מובייל:** `resize_window` ל-`mobile` (375px). בלי גלישה (`document.documentElement.scrollWidth <= innerWidth`). הכותרת "לידים ולקוחות" לא נחתכת ליד "+ משימה" ו"+ ליד" (`h1.scrollWidth <= h1.clientWidth`), ותיבת הסימון 40×40.
   - **מצב כהה:** `resize_window` עם `colorScheme: 'dark'` ו-`data-theme="dark"`. לבטל `transition` לפני מדידה. לחשב ניגודיות: מסגרת `.crm-check` מול הרקע ≥ 3, ‏`.crm-late-tag` ≥ 4.5, וטקסט ההודעה הצפה ≥ 4.5.
   - **אפס שגיאות קונסול** (`read_console_messages` עם `onlyErrors`).
4. צילום מסך של "לטיפול" ושל הכרטיס עם שורת ההזמנות, בטלפון ובמצב כהה.

- [ ] **Step 8: Commit**

```bash
git add crm-f428d7/index.html crm-f428d7/crm.js crm-f428d7/crm.css tools/test/crm-fake-api.js
git commit -m "$(printf 'CRM: הזמנות בכרטיס, לא הזמינו, משימות וחלונות רישום — עמוד\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 6: מדיניות הפרטיות ו-CLAUDE.md

**Files:**
- Modify: `privacy/index.html`, `CLAUDE.md`

- [ ] **Step 1: מדיניות הפרטיות**

ב-`privacy/index.html`, אחרי שורת ה-WhatsApp ברשימת הנמענים:

```html
            <li><strong>Telegram</strong> — התראות פנימיות לבעל העסק על פנייה חדשה ועל משימות: שם, עסק, טלפון ותוכן הפנייה.</li>
```

ואת התאריך:

```html
        <p class="legal-updated">עודכן לאחרונה: 4 בנובמבר 2026</p>
```

לוודא: `grep -c "Telegram" privacy/index.html` ⇒ `1`.

- [ ] **Step 2: CLAUDE.md**

(א) בשורת הגרסאות, להחליף את קטע ה-CRM:

```markdown
‏`/crm-f428d7/` טוען קבצים משלו: `crm-core.js?v=2`, `crm.js?v=3`, `crm.css?v=3`.
```

(ב) בכניסה של `/crm-f428d7/` ב"אזורים רגישים" — שורה אחת ארוכה — להוסיף בסוף השורה, אחרי "בדיקה בדפדפן בלי ענן: `tools/test/crm-fake-api.js`.":

```markdown
 **מאז סבב 86:** לשונית שלישית "משימות" בגיליון; הקצב והאיחור מחושבים בסקריפט ומגיעים ב-`list`; טריגר `tick` כל 5 דקות שולח תזכורות למשימות וסיכום בוקר (מייל וטלגרם); טוקן הבוט ומזהה הצ'אט נשמרים רק ב-Script Properties (`TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`) — לא בריפו ולא בבנייה.
```

(ג) סבב 86, אחרי סבב 85 ולפני `## העדפות של רועי`:

```markdown
86. **CRM — הזמנות, קצב, משימות והתראות (3–4.11.26):** אפיון: `docs/superpowers/specs/2026-11-03-crm-orders-tasks-notifications-design.md`. תוכנית: `docs/superpowers/plans/2026-11-04-crm-orders-tasks-notifications.md`.

    **החלטות רועי:**
    - "לא הזמינו" נמדד לפי הקצב של כל לקוח; בלי קצב — 45 יום.
    - משימות גם על לקוח וגם כלליות.
    - התראות במייל בוקר ובטלגרם: פנייה חדשה מיד, תזכורת למשימה בשעה, וסיכום הבוקר. הזמנות מהאתר לא נשלחות לטלגרם.
    - הבוט הישן של רועי, שכבר לא היה בשימוש, עבר להיות הבוט של ה-CRM.

    **הזמנות:**
    - "רשום הזמנה" בכרטיס, בלי התוכן — תאריך והערה בלבד.
    - "הזמין" אחרי שיחה נספר עכשיו כהזמנה.
    - המונה ו"הזמנה אחרונה" מחושבים תמיד מההיסטוריה (`recomputeOrders_`).
    - הזמנה מהאתר באותו יום של רישום ידני ממלאת את הרישום ולא נספרת פעמיים (`manualOrderOn_`, ‏`_dirty` ב-`save_`).
    - הזמנה ידנית ניתנת לביטול (`order_cancel`). הזמנה עם מספר — לא.

    **קצב ואיחור:**
    - ימי הזמנה במרחק של עד 3 ימים — הזמנה אחת.
    - קצב = חציון המרווחים, כשיש 3 ימי הזמנה ומעלה.
    - הסף = `max(round(קצב×1.5), קצב+7)`, ובלי קצב — 45.
    - נחשבים רק לקוחות בשלב "לקוח". מי שנקבע לו תאריך חזרה עתידי לא נספר.
    - המאחרים לא נכנסים ל"לטיפול", כדי לא להציף אותו — הם בסינון "לא הזמינו" ובסיכום.

    **משימות:**
    - הלשונית "משימות", עם `task_add/update/delete`.
    - משימה על לקוח נרשמת בהיסטוריה שלו כשהיא נסגרת. "בטל" בהודעה פותח אותה שוב ומוחק את הרישום.
    - ב"לטיפול" — המשימות שהגיע זמנן, מעל אנשי הקשר.

    **התראות:**
    - **טלגרם על `lead`/`quote_request`:** נשלח מחוץ לנעילה, וכשל בו לא מפיל את האירוע.
    - **`tick`:**
      - תזכורת עד 5 דקות אחרי השעה.
      - ניסיון חוזר עד שעתיים, ואחר כך מסומנת כנשלחה בלי לשלוח.
      - "(באיחור)" אחרי 30 דקות.
      - משימה שנוצרה אחרי השעה שלה לא שולחת תזכורת.
    - **סיכום בוקר:** פעם ביום, 07:30–12:00, לא בשבת, ולא ביום ריק. נשלח ל-meiraroam@gmail.com ולטלגרם.
    - **`setupNotifications`:** מנתקת webhook ישן, שומרת את הצ'אט, שולחת הודעת בדיקה ויוצרת טריגר אחד.

    **מדיניות הפרטיות:** טלגרם נוסף לרשימת הנמענים.

    **גרסאות:** `crm-core.js?v=2`, ‏`crm.js?v=3`, ‏`crm.css?v=3`.

    **בדיקות:** `crm.test.js` (64) ו-`crm-page.test.js` (19). בדפדפן — מול `crm-fake-api.js`, שמחשב את האיחור כמו הסקריפט.
```

- [ ] **Step 3: Commit**

```bash
git add privacy/index.html CLAUDE.md
git commit -m "$(printf 'מדיניות הפרטיות: טלגרם כנמען; CLAUDE.md: סבב 86\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 7: עלייה לאוויר

**Files:**
- Create (מחוץ לריפו): `~/.aroam-crm/build-crm-from-cloud.js`, ותיקיות העבודה `~/.aroam-crm/gas-crm/` ו-`~/.aroam-crm/gas-crm-live/`.
- Modify: `CLAUDE.md` (מצב הפריסה).

- [ ] **Step 1: כלי הבנייה מהענן**

`~/.aroam-crm/build-crm-from-cloud.js`:

```js
// בונה את עותק הענן של סקריפט ה-CRM: הקוד מהריפו, וארבעת הערכים (שני מזהי גיליונות,
// הסיסמה והסוד) מהעותק הפרוס שהורד ב-clasp clone. הערכים עוברים מקובץ לקובץ ולא מודפסים.
// שימוש: node build-crm-from-cloud.js <תיקיית clone של הגרסה הפרוסה> <תיקיית יעד עם .clasp.json>
const fs = require('fs');
const path = require('path');
const [from, to] = process.argv.slice(2);
const cloud = fs.readFileSync(path.join(from, 'Code.js'), 'utf8');
let code = fs.readFileSync(path.join(process.env.HOME, 'aroan/tools/google-apps-script-crm.gs'), 'utf8');
['SPREADSHEET_ID', 'ORDERS_SPREADSHEET_ID', 'CRM_PASSWORD', 'CRM_SECRET'].forEach(function (name) {
  const re = new RegExp('^var ' + name + " = '([^']*)';", 'm');
  const m = cloud.match(re);
  if (!m || !m[1] || /^PUT_/.test(m[1])) throw new Error(name + ': אין ערך בעותק שבענן');
  const all = code.match(new RegExp('^var ' + name + " = '[^']*';", 'gm')) || [];
  if (all.length !== 1) throw new Error(name + ': ' + all.length + ' הצהרות בריפו');
  // פונקציה ולא מחרוזת: אחרת $ בערך (סיסמה אקראית) היה מתפרש כתבנית החלפה
  code = code.replace(re, function () { return 'var ' + name + " = '" + m[1] + "';"; });
});
if (/'PUT_[A-Z_]+_HERE'/.test(code)) throw new Error('נשאר מציין מקום');
fs.writeFileSync(path.join(to, 'Code.js'), code);
console.log('נבנה ' + path.join(to, 'Code.js') + ' — ארבעת הערכים נלקחו מהענן');
```

- [ ] **Step 2: להוריד את הגרסה הפרוסה ולבנות**

```bash
cd ~/.aroam-crm && rm -rf gas-crm gas-crm-live && mkdir gas-crm gas-crm-live
cd ~/.aroam-crm/gas-crm-live && npx -y @google/clasp@3.4.1 clone 1HtNPX2wXuHZSMTwDQYJ_dDvtSi0M6dS6Pd4-d5F5jAd3orXDSIxnUtzd 3 --rootDir .
cd ~/.aroam-crm/gas-crm && npx -y @google/clasp@3.4.1 clone 1HtNPX2wXuHZSMTwDQYJ_dDvtSi0M6dS6Pd4-d5F5jAd3orXDSIxnUtzd --rootDir .
cmp ~/.aroam-crm/gas-crm/Code.js ~/.aroam-crm/gas-crm-live/Code.js && echo "HEAD זהה לגרסה 3"
```

Expected: `HEAD זהה לגרסה 3`. אחרת — לעצור ולהראות לרועי, בלי להציג את התוכן.

```bash
node ~/.aroam-crm/build-crm-from-cloud.js ~/.aroam-crm/gas-crm-live ~/.aroam-crm/gas-crm && node --check ~/.aroam-crm/gas-crm/Code.js
node -e "
const fs=require('fs');const a=fs.readFileSync(process.argv[1],'utf8'),b=fs.readFileSync(process.argv[2],'utf8');
['SPREADSHEET_ID','ORDERS_SPREADSHEET_ID','CRM_PASSWORD','CRM_SECRET'].forEach(n=>{const r=new RegExp('^var '+n+\" = '([^']*)';\",'m');console.log(n,a.match(r)[1]===b.match(r)[1]);});
console.log('setupNotifications:', /function setupNotifications\(/.test(a), '| tick:', /function tick\(/.test(a));
" ~/.aroam-crm/gas-crm/Code.js ~/.aroam-crm/gas-crm-live/Code.js
```

Expected: ארבע שורות `true`, ו-`setupNotifications: true | tick: true`.

לבדוק את המניפסט (אין בו סודות):

```bash
cat ~/.aroam-crm/gas-crm/appsscript.json
```

Expected: אין בו `oauthScopes`, ולכן Apps Script מזהה את ההרשאות מהקוד. אם יש — להוסיף לרשימה את שלוש ההרשאות החדשות: `https://www.googleapis.com/auth/script.external_request`, `https://www.googleapis.com/auth/script.send_mail`, `https://www.googleapis.com/auth/script.scriptapp`.

- [ ] **Step 3: push ל-HEAD בלבד (בלי גרסה ובלי פריסה)**

```bash
cd ~/.aroam-crm/gas-crm && npx -y @google/clasp@3.4.1 push --force
```

Expected: `Pushed 2 files`. ה-Web app עדיין רץ על גרסה 3, והאתר לא מושפע.

- [ ] **Step 4: ההקמה של רועי — לחכות לאישור**

לשלוח לרועי, ולחכות שיאשר:
1. **בטלגרם:** ‏@BotFather ← ‏`/mybots` ← הבוט ← API Token ← להעתיק.
2. **בעורך של "CRM — אהרוני"** (`https://script.google.com/home/projects/1HtNPX2wXuHZSMTwDQYJ_dDvtSi0M6dS6Pd4-d5F5jAd3orXDSIxnUtzd/edit?authuser=roeiaharoni4@gmail.com`): ⚙️ הגדרות הפרויקט ← מאפייני סקריפט ← "הוספת מאפיין סקריפט". שם המאפיין `TELEGRAM_TOKEN`, הערך הוא הטוקן ← "שמירת מאפייני הסקריפט".
3. **לשלוח לבוט** הודעה כלשהי.
4. **בעורך:** לבחור את `setupNotifications` ← "הפעלה" ← "בדיקת הרשאות" ← roeiaharoni4 ← "מתקדם" ← "מעבר אל CRM — אהרוני" ← **לסמן את כל התיבות** ← "המשך".
5. **לאשר** שהגיעה בטלגרם ההודעה "ה-CRM מחובר. מכאן יגיעו ההתראות."

אם `setupNotifications` עוצרת עם "שלחו לבוט הודעה כלשהי בטלגרם, והריצו שוב." — זה צפוי כשהסקריפט הישן של הבוט קיבל את ההודעה דרך ה-webhook שלו. הריצה הראשונה כבר ניתקה אותו, ולכן מספיק לשלוח לבוט הודעה נוספת ולהריץ שוב.

- [ ] **Step 5: גרסה ופריסה**

אחרי האישור של רועי:

```bash
cd ~/.aroam-crm/gas-crm && npx -y @google/clasp@3.4.1 create-version "CRM: הזמנות, קצב, משימות והתראות"
```

Expected: `Created version 4`. עם המספר שחזר:

```bash
cd ~/.aroam-crm/gas-crm && npx -y @google/clasp@3.4.1 update-deployment AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw --versionNumber 4 --description "CRM: הזמנות, קצב, משימות והתראות" && npx -y @google/clasp@3.4.1 list-deployments 1HtNPX2wXuHZSMTwDQYJ_dDvtSi0M6dS6Pd4-d5F5jAd3orXDSIxnUtzd
curl -sL "https://script.google.com/macros/s/AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw/exec"
```

Expected: `@4` ו-`CRM — פעיל`.

לבדוק שהסוד עדיין עובר, בלי להדפיס אותו (התשובה הצפויה היא `bad event`, ולא `unauthorized`):

```bash
node -e "
const fs=require('fs');const code=fs.readFileSync(process.env.HOME+'/.aroam-crm/gas-crm/Code.js','utf8');
const secret=code.match(/^var CRM_SECRET = '([^']*)';/m)[1];
fetch('https://script.google.com/macros/s/AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw/exec',{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'event',secret,event:{}})}).then(r=>r.text()).then(t=>console.log(t));
"
```

Expected: `{"ok":false,"error":"bad event"}`.

רועי פותח את ה-CRM בטלפון — העמוד הישן, עוד לפני ה-push — ומוודא שהרשימה נטענת. כך נבדק ש-`list` עונה מול הסקריפט החדש ושהעמוד הישן ממשיך לעבוד. Claude לא קורא ל-`list`, כי זה דורש את סיסמת הייצור.

**אם משהו נשבר:** `update-deployment AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw --versionNumber 3` מחזיר את הגרסה הקודמת, ואת הטריגר `tick` מוחקים בעמוד הטריגרים בעורך. הלשונית "משימות" נשארת בגיליון ולא מפריעה לגרסה 3.

- [ ] **Step 6: push של האתר (רועי) ובדיקה בחי**

לבקש מרועי לדחוף ב-GitHub Desktop. אחרי כמה דקות:

```bash
for u in 'crm-f428d7/' 'crm-f428d7/crm.js?v=3' 'crm-f428d7/crm-core.js?v=2' 'crm-f428d7/crm.css?v=3' 'privacy/'; do printf "%-30s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code}' "https://aroam.co.il/$u")"; done
curl -s 'https://aroam.co.il/crm-f428d7/' | grep -o 'crm\.js?v=[0-9]*\|crm-core\.js?v=[0-9]*\|crm\.css?v=[0-9]*' | sort -u
curl -s 'https://aroam.co.il/privacy/' | grep -c 'Telegram'
```

Expected: כל הכתובות 200, הגרסאות v=3 / v=2 / v=3, ו-`1`.

רועי נכנס מהטלפון ובודק:
- הסינונים "משימות" ו"לא הזמינו".
- בכרטיס של לקוח יש שורת הזמנות.

- [ ] **Step 7: תזכורת בדיקה — באישור רועי**

רועי יוצר מהטלפון משימה עם שעה בעוד כ-10 דקות. התזכורת אמורה להגיע בטלגרם עד 5 דקות אחרי השעה. אחרי שהגיעה, הוא מוחק את המשימה. סיכום הבוקר הראשון יגיע בבוקר שאחרי, אם יש בו משהו.

- [ ] **Step 8: ניקוי ו-CLAUDE.md**

```bash
rm -rf ~/.aroam-crm/gas-crm ~/.aroam-crm/gas-crm-live && ls ~/.aroam-crm
```

ב-CLAUDE.md, בסוף סבב 86:

```markdown
    **נפרס (‹תאריך›):** סקריפט ה-CRM **גרסה 4** על אותה פריסה, אחרי ש-`setupNotifications` הורצה ואושרה. הודעת הבדיקה הגיעה, והטריגר `tick` פעיל. הערכים לבנייה נלקחו מהעותק בענן דרך `~/.aroam-crm/build-crm-from-cloud.js`, ותיקיות העבודה נמחקו. **לעדכון הבא:** `clasp clone` לשתי תיקיות (HEAD ו-`<גרסה>`), `cmp`, ‏`build-crm-from-cloud.js`, ‏`push`, ואז ‏`create-version` ו-`update-deployment`. **אם נוספות הרשאות חדשות**, צריך הרצה ואישור מהעורך לפני `update-deployment`.
```

```bash
git add CLAUDE.md
git commit -m "$(printf 'CLAUDE.md: סבב 86 נפרס\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

## Self-Review

**כיסוי האפיון:**

| חלק באפיון | משימה |
|---|---|
| חלק 1 — רישום ידני ו"הזמין" | Task 1 (סקריפט), Task 4 (crm-core), Task 5 (עמוד) |
| מניעת ספירה כפולה | `manualOrderOn_` ו-`_dirty` ב-Task 1; ‏`orderOn` ושאלת "עוד אחת" ב-Tasks 4–5 |
| ביטול הזמנה | `order_cancel` ב-Task 1; כפתור "בטל" ב-Task 5 |
| חלק 2 — החישוב | `orderEvents_`, ‏`rhythmFor_`, ‏`lateInfo_` ב-Task 1 |
| מי נחשב מאחר | `lateInfo_` ב-Task 1 |
| חלק 2 — המסך | `filterContacts('late')`, ‏`ordersLine`, ‏`lateLabel`, ‏`orderSubLine` ב-Task 4; העמוד ב-Task 5 |
| חלק 3 — הלשונית | Task 2 |
| הוספה, עריכה, סימון ו"בטל" | Task 2; ‏`toast` עם פעולה ב-Task 5 |
| "לטיפול" עם משימות ומונים | `counts` ו-`dueTasks` ב-Task 4; ‏`renderList` ב-Task 5 |
| חלק 4 — `tick` וסיכום | Task 3 |
| טלגרם על פנייה | Task 3 |
| תזכורות | Task 3 |
| הקמה | `setupNotifications` ב-Task 3; צעדי רועי ב-Task 7 |
| בטיחות | הטוקן ב-Script Properties, צ'אט קבוע, ושליחה מחוץ לנעילה — Task 3 |
| חלק 7 — פרטיות | Task 6 |
| חלק 9 — השקה בסדר הנכון | Task 7 |

**שמות עקביים:**
- `contactOut_` ו-`orderDaysByContact_` מוגדרות ב-Task 1, ומשמשות ב-Tasks 2–3.
- `saveTasks_` מוגדרת ב-Task 2, ומשמשת ב-`tick` ב-Task 3.
- `cmp_` מוגדרת ב-Task 3 — רק הסיכום משתמש בה.
- `taskMatchesQuery` מוגדרת ב-Task 4, ומשמשת את `renderList` ב-Task 5.
- `FOLLOW_CHOICES` קיים כבר ב-`crm.js`, ומשמש את `choiceFor` ואת `taskChips`.
- `chipGroup`, ‏`openOverlay`, ‏`closeOverlay` ו-`rerender` קיימות כבר ב-`crm.js`.

**ספירת הבדיקות:**

| קובץ | קיימות | חדשות | סה"כ |
|---|---|---|---|
| `crm.test.js` | 35 | Task 1: 12 · Task 2: 4 · Task 3: 13 | 64 |
| `crm-page.test.js` | 15 | 4 | 19 |

**סטיות מכוונות מהאפיון:**
- החלונות "רישום הזמנה" ו"משימה" מחכים לתשובת השרת ומציגים שגיאה בתוך החלון, כמו חלון "ליד חדש" הקיים — לא שמירה אופטימית. סימון משימה כן אופטימי.
- `orderDays_` שבאפיון נקרא כאן `orderDaysByContact_`.
- החיפוש חל גם על המשימות (הטקסט ושם הלקוח). האפיון לא קבע.
- בשורות של "לקוח" ו"לא הזמינו", אחרי תווית "לחזור" מופיע גם "מאחר ב-N ימים". בכרטיס יש תג משלו.
