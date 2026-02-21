/**
 * Main entry point for all Workspace apps
 */
function buildAddOn(e) {
  var lang = (e && e.parameters && e.parameters.lang) ? e.parameters.lang : 'en';
  var isHe = (lang === 'he');
  
  var selectedAction = (e && e.formInput && e.formInput.action_type) ? e.formInput.action_type : 'self';
  var imageUrl = (e && e.formInput && e.formInput.image_url) ? e.formInput.image_url : '';

  var i18n = {
    title: isHe ? "מנהל תמונות Workspace" : "Workspace Image Manager",
    subtitle: isHe ? "עיבוד תמונות חכם ומהיר" : "Fast & Smart Image Processing",
    sectionSource: isHe ? "מקור התמונה" : "Image Source",
    sectionDest: isHe ? "הגדרות ויעד" : "Settings & Destination",
    urlTitle: isHe ? "קישור ישיר (URL)" : "Direct Image URL",
    renameTitle: isHe ? "שם קובץ חדש" : "New Filename",
    actionTitle: isHe ? "בחר יעד" : "Choose Destination",
    btnRun: isHe ? "בצע פעולה 🚀" : "Process 🚀",
    btnLang: isHe ? "English 🌐" : "עברית 🌐",
    targetEmail: isHe ? "כתובת אימייל ליעד" : "Recipient Email",
    optDraft: isHe ? "צור טיוטה (Gmail)" : "Create Draft (Gmail)",
    optSelf: isHe ? "שלח אליי (Inbox)" : "Send to My Inbox",
    optOther: isHe ? "שלח לאימייל אחר" : "Send to Other Email",
    optDrive: isHe ? "שמור ב-Google Drive" : "Save to Google Drive",
    preview: isHe ? "תצוגה מקדימה" : "Image Preview"
  };

  var card = CardService.newCardBuilder();
  
  // Reverted to the "Plain Photo" icon style
  var headerIcon = "https://www.gstatic.com/images/icons/material/system/2x/image_googblue_48dp.png";
  card.setHeader(CardService.newCardHeader()
      .setTitle(i18n.title)
      .setSubtitle(i18n.subtitle)
      .setImageStyle(CardService.ImageStyle.CIRCLE)
      .setImageUrl(headerIcon));

  // --- SECTION 1: SOURCE ---
  var sourceSection = CardService.newCardSection()
      .setHeader("<b>" + i18n.sectionSource + "</b>");

  sourceSection.addWidget(CardService.newTextInput()
      .setFieldName("image_url")
      .setTitle(i18n.urlTitle)
      .setValue(imageUrl)
      .setOnChangeAction(CardService.newAction().setFunctionName("refreshCard").setParameters({lang: lang})));
  
  card.addSection(sourceSection);

  // --- SECTION 2: SETTINGS & DESTINATION ---
  var destSection = CardService.newCardSection()
      .setHeader("<b>" + i18n.sectionDest + "</b>");

  destSection.addWidget(CardService.newTextInput()
      .setFieldName("custom_name")
      .setTitle(i18n.renameTitle));

  var actionDropdown = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle(i18n.actionTitle)
      .setFieldName("action_type")
      .setOnChangeAction(CardService.newAction().setFunctionName("refreshCard").setParameters({lang: lang}));
  
  
  actionDropdown.addItem(i18n.optSelf, "self", selectedAction === "self");
  actionDropdown.addItem(i18n.optDraft, "draft", selectedAction === "draft");
  actionDropdown.addItem(i18n.optOther, "other", selectedAction === "other");
  actionDropdown.addItem(i18n.optDrive, "drive", selectedAction === "drive");
  destSection.addWidget(actionDropdown);

  if (selectedAction === "other") {
    destSection.addWidget(CardService.newTextInput()
        .setFieldName("target_email")
        .setTitle(i18n.targetEmail));
  }

  card.addSection(destSection);

  // --- SECTION 3: PREVIEW ---
  if (imageUrl && (imageUrl.toLowerCase().indexOf('http') === 0)) {
    var previewSection = CardService.newCardSection().setHeader("🖼️ " + i18n.preview);
    previewSection.addWidget(CardService.newImage().setImageUrl(imageUrl).setAltText("Preview failed"));
    card.addSection(previewSection);
  }

  // --- FIXED FOOTER ---
  var fixedFooter = CardService.newFixedFooter()
      .setPrimaryButton(CardService.newTextButton()
          .setText(i18n.btnRun)
          .setBackgroundColor("#1a73e8")
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOnClickAction(CardService.newAction().setFunctionName("processImageAction").setParameters({lang: lang})))
      .setSecondaryButton(CardService.newTextButton()
          .setText(i18n.btnLang)
          .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn").setParameters({lang: isHe ? 'en' : 'he'})));

  card.setFixedFooter(fixedFooter);

  return card.build();
}

function refreshCard(e) {
  return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildAddOn(e)))
      .build();
}

function processImageAction(e) {
  var lang = e.parameters.lang || 'en';
  var isHe = (lang === 'he');
  
  var url = e.formInput.image_url;
  var actionType = e.formInput.action_type;
  var customName = e.formInput.custom_name;
  var targetEmail = e.formInput.target_email;
  
  if (!url) return showNotification(isHe ? "שגיאה: חסר קישור לתמונה" : "Error: Missing Image URL");

  try {
    var response = UrlFetchApp.fetch(url);
    var blob = response.getBlob();
    
    if (customName) {
      var contentType = blob.getContentType();
      var ext = (contentType && contentType.indexOf('/') !== -1) ? contentType.split('/')[1] : "png";
      blob.setName(customName + "." + ext);
    }

    var fileName = blob.getName();

    switch (actionType) {
      case "drive":
        DriveApp.createFile(blob);
        break;
      case "self":
        var myEmail = Session.getActiveUser().getEmail();
        GmailApp.sendEmail(myEmail, "📷 " + fileName, "Find your image attached.", { attachments: [blob] });
        break;
      case "other":
        if (!targetEmail) throw "Missing recipient email";
        GmailApp.sendEmail(targetEmail, "📷 Shared Image: " + fileName, "An image has been shared with you.", { attachments: [blob] });
        break;
      case "draft":
      default:
        GmailApp.createDraft("", "📷 Imported: " + fileName, "Image attached.", { attachments: [blob] });
        break;
    }

    return showNotification(isHe ? "✅ הפעולה הושלמה בהצלחה!" : "✅ Action completed successfully!");

  } catch (err) {
    return showNotification("❌ Error: " + err.toString());
  }
}

function showNotification(text) {
  return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(text))
      .build();
}