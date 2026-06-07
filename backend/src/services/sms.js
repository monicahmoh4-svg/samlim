// ─── SMS Service ──────────────────────────────────────────────────────
const send = async (phone, message) => {
  try {
    // Normalize to +254XXXXXXXXX
    const normalized = phone
      .replace(/\s+/g, '')
      .replace(/^0/, '+254')
      .replace(/^254/, '+254')
      .replace(/^\+\+/, '+');

    if (process.env.NODE_ENV === 'development' || process.env.AT_USERNAME === 'sandbox') {
      // Log instead of sending in dev/sandbox
      console.log(`[SMS] → ${normalized}: ${message}`);
      return { status: 'dev_logged' };
    }

    const AfricasTalking = require('africastalking');
    const at = AfricasTalking({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME,
    });

    const result = await at.SMS.send({
      to: [normalized],
      message,
      from: process.env.AT_SENDER_ID || 'SAM-LiMP',
    });

    console.log(`[SMS] Sent to ${normalized}:`, result.SMSMessageData?.Message);
    return result;
  } catch (err) {
    console.error('[SMS] Failed:', err.message);
    // Don't throw — SMS failure shouldn't break core flow
    return { status: 'failed', error: err.message };
  }
};

const broadcastToBuyers = async (buyers, message) => {
  const results = await Promise.allSettled(buyers.map(b => send(b.phone, message)));
  return results;
};

module.exports = { send, broadcastToBuyers };
