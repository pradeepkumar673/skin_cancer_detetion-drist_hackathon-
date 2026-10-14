/**
 * Template: receipt_to_patient
 * Payment receipt with order ID and payment ID (no card data).
 */
export function receiptToPatient({
  patientFirstName,
  doctorName,
  mode,
  amountINR,
  orderId,
  paymentId,
  sessionUrl,
}) {
  const subject = 'Payment receipt for consultation';
  const text = `Hello ${patientFirstName},

Thank you for your payment. Your consultation with Dr. ${doctorName} is confirmed.

Receipt Details:
Amount Paid: INR ${amountINR}
Order ID: ${orderId}
Payment ID: ${paymentId}
Mode: ${mode}

No card data is stored on our servers.

You can join the consultation session at the scheduled time here:
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
  <p>Hello ${patientFirstName},</p>
  <p>Thank you for your payment. Your consultation with <strong>Dr. ${doctorName}</strong> is confirmed.</p>
  <div style="border: 1px solid #17252A; padding: 12px; border-radius: 4px; background-color: #DEF2F1; margin: 16px 0;">
    <h3 style="margin-top: 0; font-size: 14px;">Payment Receipt</h3>
    <p style="margin: 4px 0; font-size: 13px;"><strong>Amount Paid:</strong> ₹${amountINR}</p>
    <p style="margin: 4px 0; font-size: 13px; font-family: monospace;"><strong>Order ID:</strong> ${orderId}</p>
    <p style="margin: 4px 0; font-size: 13px; font-family: monospace;"><strong>Payment ID:</strong> ${paymentId}</p>
    <p style="margin: 4px 0; font-size: 13px;"><strong>Mode:</strong> ${mode}</p>
  </div>
  <p style="font-size: 12px; color: #17252A;">Payment was processed securely through Razorpay. No payment card details are stored on platform servers.</p>
  <p><a href="${sessionUrl}" style="display: inline-block; padding: 8px 16px; background-color: #2B7A78; color: #FEFFFF; text-decoration: none; border-radius: 4px; font-weight: bold;">Join Consultation Room</a></p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
