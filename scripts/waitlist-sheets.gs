/**
 * Waitlist → Google Sheets sync
 *
 * Setup:
 * 1. Open your Google Sheet
 * 2. Extensions → Apps Script → paste this entire file → Save
 * 3. Click Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Click Deploy → copy the web app URL
 * 5. In Supabase Edge Function secrets, set:
 *      WAITLIST_SHEETS_WEBHOOK_URL = <the URL you just copied>
 */

var SHEET_NAME = "Signups";

var HEADERS = [
  "Timestamp", "Email", "Name", "Role", "Stage", "Sector",
  "Urgency", "Intent", "Biggest Pain", "Company", "LinkedIn",
  "Source", "Campaign", "Status", "Waitlist Position", "Referral Code"
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    }

    sheet.appendRow([
      data.timestamp       || "",
      data.email           || "",
      data.name            || "",
      data.role            || "",
      data.stage           || "",
      data.sector          || "",
      data.urgency         || "",
      data.intent          || "",
      data.biggest_pain    || "",
      data.company_name    || "",
      data.linkedin_url    || "",
      data.source          || "",
      data.campaign        || "",
      data.status          || "",
      data.waitlist_position || "",
      data.referral_code   || ""
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
