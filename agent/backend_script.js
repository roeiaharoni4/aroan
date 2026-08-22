/**
 * Aroam Catalog - Backend Script (SECURE)
 * 
 * INSTRUCTIONS:
 * 1. Open your Google Sheet (where the products are).
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any code there and paste this entire code.
 * 4. Save (Floppy disk icon).
 * 5. Click "Deploy" > "New deployment" (or "Manage deployments" > Edit > New Version).
 * 6. Select type: "Web app".
 * 7. Execute as: "Me".
 * 8. Who has access: "Anyone".
 * 9. Click "Deploy" and COPY the "Web App URL".
 * 10. Send this URL to the AI agent.
 */

const SHEET_NAME = "AgentQuotes"; // Separate tab for orders
// הערה (22.8.26): הסכמה כאן היא גם ה-CRM של דף הסוכן — js/agent.js משחזר
// ממנה שמות לקוחות, מחירים והזמנה אחרונה ("שחזור מהענן"). טלפון וכתובת
// נשמרים רק במכשיר, כדי שהפיצ'ר לא יחייב פריסה מחדש של הסקריפט בענן.

// חשוב: קבע כאן סיסמה חזקה משלך לפני הפריסה ב-Apps Script.
// אל תשמור את הסיסמה האמיתית בקובץ הזה - הוא מוגש פומבית באתר.
// באתר: הסיסמה נשאלת פעם אחת בדף הסוכן ונשמרת ל-session בלבד.
const API_PASSWORD = "SET_YOUR_OWN_STRONG_PASSWORD"; // Simple security token

function doGet(e) {
    return handleRequest(e);
}

function doPost(e) {
    return handleRequest(e);
}

function handleRequest(e) {
    const lock = LockService.getScriptLock();
    lock.tryLock(10000);

    try {
        // 1. SECURITY CHECK
        if (!e.parameter.password || e.parameter.password !== API_PASSWORD) {
            return ContentService.createTextOutput(JSON.stringify({ error: "Access Denied: Wrong Password" }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let sheet = ss.getSheetByName(SHEET_NAME);

        // Create 'AgentQuotes' sheet if it doesn't exist
        if (!sheet) {
            sheet = ss.insertSheet(SHEET_NAME);
            sheet.appendRow(["ID", "Date", "Customer", "Total", "ItemsJSON", "Ref"]);
        }

        const action = e.parameter.action;

        // --- GET HISTORY ---
        if (action === "get") {
            const data = sheet.getDataRange().getValues();
            const headers = data.shift(); // Remove headers
            const history = (data.length > 0) ? data.map(row => {
                return {
                    id: row[0],
                    date: row[1],
                    customer: row[2],
                    total: Number(row[3]),
                    items: JSON.parse(row[4] || "[]")
                };
            }).reverse() : []; // Newest first

            return ContentService.createTextOutput(JSON.stringify(history))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // --- SAVE ORDER ---
        else if (action === "save") {
            let payload;
            // Handle POST body
            if (e.postData && e.postData.contents) {
                payload = JSON.parse(e.postData.contents);
            } else {
                payload = {
                    id: e.parameter.id,
                    date: e.parameter.date,
                    customer: e.parameter.customer,
                    total: e.parameter.total,
                    items: JSON.parse(e.parameter.items || "[]")
                };
            }

            sheet.appendRow([
                payload.id,
                payload.date,
                payload.customer,
                payload.total,
                JSON.stringify(payload.items),
                new Date() // Timestamp
            ]);

            return ContentService.createTextOutput(JSON.stringify({ success: true }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // --- DELETE ORDER ---
        else if (action === "delete") {
            const idToDelete = e.parameter.id;
            const data = sheet.getDataRange().getValues();
            // Start from end to safe delete
            for (let i = data.length - 1; i >= 1; i--) {
                if (data[i][0] == idToDelete) {
                    sheet.deleteRow(i + 1);
                    break; // Assume 1 match
                }
            }
            return ContentService.createTextOutput(JSON.stringify({ success: true }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        return ContentService.createTextOutput(JSON.stringify({ error: "Unknown action" }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (e) {
        return ContentService.createTextOutput(JSON.stringify({ error: e.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    } finally {
        lock.releaseLock();
    }
}
