/**
 * Template: expired
 * Notifies patient that payment window elapsed and slot was released.
 */
export function expired({ patientFirstName, doctorName, scheduledTime, bookingUrl }) {
  const subject = 'Consultation request expired';
  const text = `Hello ${patientFirstName},

The consultation request for ${scheduledTime || 'the requested session'} with Dr. ${doctorName} has expired because payment was not received within the required payment window.

The reserved time slot has been released back into the physician's public schedule.

If you would still like to consult with Dr. ${doctorName}, you are welcome to submit a new consultation request here:
${bookingUrl}

Decision support only. A doctor makes the diagnosis.
SkinSentry`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; color: #17252A; background-color: #FEFFFF; padding: 20px; line-height: 1.5;">
  <p>Hello ${patientFirstName},</p>
  <p>The consultation request for <strong>${scheduledTime || 'the requested session'}</strong> with <strong>Dr. ${doctorName}</strong> has expired because payment was not completed within the designated window.</p>
  <p>The reserved time slot has been released back into the physician's public availability.</p>
  <p>If you would like to book a consultation, you may submit a new request at your convenience:</p>
  <p><a href="${bookingUrl}" style="color: #2B7A78; font-weight: bold;">Book Consultation</a></p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
