/**
 * Template: confirmed_to_doctor
 * Confirmation details for the physician.
 */
export function confirmedToDoctor({ doctorName, patientFirstName, mode, scheduledTime, dashboardUrl }) {
  const subject = `Appointment confirmed with ${patientFirstName}`;
  const text = `Hello Dr. ${doctorName},

Your consultation with patient ${patientFirstName} has been scheduled.

Consultation Mode: ${mode}
Scheduled Time: ${scheduledTime}

The patient has been notified to complete their payment within the required payment window. You can view all upcoming consultations on your practice dashboard:
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
  <p>Your consultation with patient <strong>${patientFirstName}</strong> has been scheduled.</p>
  <ul>
    <li><strong>Consultation Mode:</strong> ${mode}</li>
    <li><strong>Scheduled Time:</strong> ${scheduledTime}</li>
  </ul>
  <p>The patient has been notified to complete payment. You can track this consultation on your dashboard:</p>
  <p><a href="${dashboardUrl}" style="color: #2B7A78; font-weight: bold;">Physician Practice Dashboard</a></p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
