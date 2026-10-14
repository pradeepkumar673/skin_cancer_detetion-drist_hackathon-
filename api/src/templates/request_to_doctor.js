/**
 * Template: request_to_doctor
 * Notifies physician of a new consultation request.
 */
export function requestToDoctor({ doctorName, patientFirstName, mode, requestedTime, dashboardUrl }) {
  const subject = 'New consultation request';
  const text = `Hello Dr. ${doctorName},

You have received a new consultation request from patient ${patientFirstName}.

Consultation Mode: ${mode}
Requested Time: ${requestedTime || 'Awaiting physician scheduling'}

Please review this request and confirm your availability on your physician dashboard:
${dashboardUrl}

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
  <p>You have received a new consultation request from patient <strong>${patientFirstName}</strong>.</p>
  <ul>
    <li><strong>Consultation Mode:</strong> ${mode}</li>
    <li><strong>Requested Time:</strong> ${requestedTime || 'Awaiting physician scheduling'}</li>
  </ul>
  <p>Please review this request and confirm your availability on your physician dashboard:</p>
  <p><a href="${dashboardUrl}" style="color: #2B7A78; font-weight: bold;">Sign in to Physician Dashboard</a></p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
