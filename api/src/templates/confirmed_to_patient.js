/**
 * Template: confirmed_to_patient
 * Confirmed appointment details with dual timezones and payment link.
 */
export function confirmedToPatient({
  patientFirstName,
  doctorName,
  mode,
  timeInPatientTimezone,
  timeInDoctorTimezone,
  paymentDeadlineMinutes,
  paymentUrl,
}) {
  const subject = `Your appointment is confirmed for ${timeInPatientTimezone}`;
  const text = `Hello ${patientFirstName},

Dr. ${doctorName} has confirmed your consultation.

Consultation Mode: ${mode}
Your Local Time: ${timeInPatientTimezone}
Doctor Local Time: ${timeInDoctorTimezone}

Payment Deadline: Please complete payment within ${paymentDeadlineMinutes} minutes to secure your slot. If payment is not completed before the deadline, the reserved time slot will be released automatically.

To complete your payment and access the consultation room:
${paymentUrl}

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
  <p>Dr. ${doctorName} has confirmed your upcoming consultation.</p>
  <ul>
    <li><strong>Consultation Mode:</strong> ${mode}</li>
    <li><strong>Your Time:</strong> ${timeInPatientTimezone}</li>
    <li><strong>Doctor Time:</strong> ${timeInDoctorTimezone}</li>
    <li><strong>Payment Window:</strong> ${paymentDeadlineMinutes} minutes</li>
  </ul>
  <p style="color: #17252A;">Please complete payment within <strong>${paymentDeadlineMinutes} minutes</strong> to secure your reservation. If payment is not completed in time, the slot will be released automatically.</p>
  <p><a href="${paymentUrl}" style="display: inline-block; padding: 8px 16px; background-color: #2B7A78; color: #FEFFFF; text-decoration: none; border-radius: 4px; font-weight: bold;">Complete Payment to Secure Slot</a></p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
