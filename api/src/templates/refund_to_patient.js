/**
 * Template: refund_to_patient
 * Informs patient of a processed consultation refund.
 */
export function refundToPatient({
  patientFirstName,
  amountINR,
  orderId,
  refundId,
  reason,
  refundPolicyText,
}) {
  const subject = 'Your consultation refund has been processed';
  const text = `Hello ${patientFirstName},

A refund of INR ${amountINR} has been issued for your consultation.

Refund Details:
Amount: INR ${amountINR}
Order ID: ${orderId}
Refund ID: ${refundId}
Reason: ${reason || 'Administrative refund'}

Refund Policy:
${refundPolicyText}

Funds typically return to the original payment method within 5 to 7 business days according to standard banking processing times.

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
  <p>A refund of <strong>₹${amountINR}</strong> has been issued for your consultation.</p>
  <div style="border: 1px solid #17252A; padding: 12px; border-radius: 4px; background-color: #DEF2F1; margin: 16px 0;">
    <h3 style="margin-top: 0; font-size: 14px;">Refund Information</h3>
    <p style="margin: 4px 0; font-size: 13px;"><strong>Refund Amount:</strong> ₹${amountINR}</p>
    <p style="margin: 4px 0; font-size: 13px; font-family: monospace;"><strong>Order ID:</strong> ${orderId}</p>
    <p style="margin: 4px 0; font-size: 13px; font-family: monospace;"><strong>Refund ID:</strong> ${refundId}</p>
    <p style="margin: 4px 0; font-size: 13px;"><strong>Reason:</strong> ${reason || 'Administrative refund'}</p>
  </div>
  <p style="font-size: 12px; color: #17252A;"><strong>Platform Policy:</strong> ${refundPolicyText}</p>
  <p style="font-size: 12px; color: #17252A;">Funds will reflect in your account within 5 to 7 business days according to bank processing schedules.</p>
  <hr style="border: none; border-top: 1px solid #DEF2F1; margin: 20px 0;">
  <p style="font-size: 11px; color: #17252A;">Decision support only. A doctor makes the diagnosis.<br>SkinSentry Medical Platform</p>
</body>
</html>`;

  return { subject, text, html };
}
