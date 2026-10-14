/**
 * Template: payment_received_to_doctor
 * Informs physician that consultation fee payment was confirmed.
 */
export function paymentReceivedForDoctor({ doctorName, patientFirstName, mode, scheduledTime, sessionUrl }) {
  const subject = 'Payment received for consultation';
  const text = `Hello Dr. ${doctorName},

Payment has been successfully received for your upcoming consultation with ${patientFirstName}.

Consultation Mode: ${mode}
Scheduled Time: ${scheduledTime}

You may access the session room directly when the scheduled time arrives:
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
  <p>Hello Dr. ${doctorName},</p>
  <p>Payment has been successfully received for your consultation with <strong>${patientFirstName}</strong>.</p>
  <ul>
    <li><strong>Consultation Mode:</strong> ${mode}</li>
    <li><strong>Scheduled Time:</strong> ${scheduledTime}</li>
  </ul>
  <p>You can join the consultation session room when the scheduled time arrives:</p>
  <p><a href="${sessionUrl}" style="color: #2B7A78; font-weight: bold;">Open Consultation Session</a></p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
