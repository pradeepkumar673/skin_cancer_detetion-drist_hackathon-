/**
 * Template: cancelled
 * Notifies user of appointment cancellation.
 */
export function cancelled({ recipientFirstName, otherPartyName, scheduledTime, reason, appointmentsUrl }) {
  const subject = 'Consultation cancelled';
  const text = `Hello ${recipientFirstName},

The consultation scheduled for ${scheduledTime || 'pending schedule'} with ${otherPartyName} has been cancelled.

Reason for Cancellation:
${reason || 'Not specified'}

Any active reservations have been released. If payment was completed, an automated refund has been initiated in accordance with our refund policy.

You can view your appointment history here:
${appointmentsUrl}

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
  <p>The consultation scheduled for <strong>${scheduledTime || 'pending schedule'}</strong> with <strong>${otherPartyName}</strong> has been cancelled.</p>
  <div style="border-left: 3px solid #17252A; padding-left: 10px; margin: 15px 0; font-size: 13px;">
    <strong>Reason:</strong> ${reason || 'Not specified'}
  </div>
  <p>The reserved time slot has been released. If payment was completed, an automated refund has been initiated in accordance with our refund terms.</p>
  <p><a href="${appointmentsUrl}" style="color: #2B7A78; font-weight: bold;">View Appointments</a></p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
