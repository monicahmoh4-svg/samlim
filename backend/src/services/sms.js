const send = async (phone, message) => {
  try {
    const normalized = phone
      .replace(/\s+/g, '')
      .replace(/^0/, '+254')
      .replace(/^254/, '+254')
      .replace(/^\+\+/, '+');

    if (process.env.NODE_ENV !== 'production' || process.env.AT_USERNAME === 'sandbox') {
      console.log(`[SMS] → ${normalized}: ${message}`);
      return { status: 'logged' };
    }

    const AfricasTalking = require('africastalking');
    const at = AfricasTalking({
      apiKey:   process.env.AT_API_KEY,
      username: process.env.AT_USERNAME,
    });
    const result = await at.SMS.send({
      to:      [normalized],
      message,
      from:    process.env.AT_SENDER_ID || 'SAM-LiMP',
    });
    return result;
  } catch (err) {
    console.error('[SMS] Failed:', err.message);
    return { status: 'failed', error: err.message };
  }
};

module.exports = { send };
