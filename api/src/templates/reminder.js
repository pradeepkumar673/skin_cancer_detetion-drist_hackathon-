/**
 * Template: reminder
 * Reminder sent prior to confirmed consultation session.
 */
export function reminder({ recipientFirstName, otherPartyName, mode, scheduledTime, sessionUrl }) {
  const subject = 'Upcoming consultation reminder';
  const text = `Hello ${recipientFirstName},

This is a reminder for your upcoming ${mode} consultation with ${otherPartyName}.

Scheduled Time: ${scheduledTime}

Please join the consultation room a few minutes prior to the scheduled start time:
${sessionUrl}

Decision support only. A doctor makes the diagnosis.
SkinSentry`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; color: #17252A; background-color: #FEFFFF; padding: 20px; line-height: 1.5;">
  <p>Hello ${recipientFirstName},</p>
  <p>This is a reminder for your upcoming <strong>${mode}</strong> consultation with <strong>${otherPartyName}</strong>.</p>
  <ul>
    <li><strong>Scheduled Time:</strong> ${scheduledTime}</li>
    <li><strong>Consultation Mode:</strong> ${mode}</li>
  </ul>
  <p>Please join the consultation room a few minutes before the session starts:</p>
  <p><a href="${sessionUrl}" style="display: inline-block; padding: 8px 16px; background-color: #2B7A78; color: #FEFFFF; text-decoration: none; border-radius: 4px; font-weight: bold;">Enter Consultation Room</a></p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
