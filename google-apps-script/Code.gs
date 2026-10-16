function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || "{}");
    var expectedSecret = PropertiesService.getScriptProperties().getProperty("SCHEDULE_EMAIL_SECRET");

    if (!expectedSecret || !payload.secret || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: "Unauthorized." });
    }
    if (!isValidEmail(payload.to) || !payload.subject || !payload.text) {
      return jsonResponse({ ok: false, error: "A valid recipient, subject, and message are required." });
    }

    MailApp.sendEmail({
      to: payload.to,
      subject: String(payload.subject).slice(0, 250),
      body: String(payload.text).slice(0, 10000),
      htmlBody: String(payload.html || payload.text).slice(0, 50000),
      name: "WorshipFlow",
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Schedule email delivery failed:", error);
    return jsonResponse({
      ok: false,
      error: error && error.message ? error.message : "Email delivery failed.",
    });
  }
}

function isValidEmail(value) {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
