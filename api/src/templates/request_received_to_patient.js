/**
 * Template: request_received_to_patient
 * Informs patient that their request was sent to the doctor.
 */
export function requestReceivedToPatient({ patientFirstName, doctorName, mode, requestedTime, appointmentsUrl }) {
  const subject = 'Your consultation request has been received';
  const text = `Hello ${patientFirstName},

Your consultation request with Dr. ${doctorName} has been received.

Consultation Mode: ${mode}
Requested Time: ${requestedTime || 'Flexible (Physician will propose time)'}

Dr. ${doctorName} has been notified. Once the doctor reviews and confirms the session time, you will receive an email confirmation with payment instructions.

You can monitor the status of your request here:
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
  <p>Hello ${patientFirstName},</p>
  <p>Your consultation request with <strong>Dr. ${doctorName}</strong> has been received.</p>
  <ul>
    <li><strong>Consultation Mode:</strong> ${mode}</li>
    <li><strong>Requested Time:</strong> ${requestedTime || 'Flexible (Physician will propose time)'}</li>
  </ul>
  <p>The physician has been notified. Once the doctor confirms the session time, you will receive an email confirmation with payment instructions.</p>
  <p><a href="${appointmentsUrl}" style="color: #2B7A78; font-weight: bold;">View My Appointments</a></p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
