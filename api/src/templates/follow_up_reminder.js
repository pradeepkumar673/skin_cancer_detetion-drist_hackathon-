/**
 * Template: follow_up_reminder
 * Routine follow-up reminder to re-photograph a lesion.
 * Strictly de-identified: never contains health results, scores, or diagnoses.
 */
export function followUpReminder({ recipientFirstName, lesionLabel, newCaseUrl }) {
  const labelText = lesionLabel || 'your skin spot';
  const subject = `Time to photograph ${labelText} again`;
  const text = `Hello ${recipientFirstName},

This is a scheduled reminder to take a follow-up photograph of ${labelText}. Regular monitoring of changes over time helps track stability.

Submit your new photo here:
${newCaseUrl}

Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis.
SkinSentry Medical Platform`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; color: #17252A; background-color: #FEFFFF; padding: 20px; line-height: 1.5;">
  <p>Hello ${recipientFirstName},</p>
  <p>This is a scheduled reminder to take a follow-up photograph of <strong>${labelText}</strong>. Regular monitoring of changes over time helps track stability.</p>
  <p>
    <a href="${newCaseUrl}" style="display: inline-block; padding: 8px 16px; background-color: #2B7A78; color: #FEFFFF; text-decoration: none; border-radius: 4px; font-weight: bold;">
      Submit Follow-up Photo
    </a>
  </p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">
    Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis.<br>
    SkinSentry Medical Platform
  </p>
</body>
</html>`;

  return { subject, text, html };
}
