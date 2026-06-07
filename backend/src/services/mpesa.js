const axios = require('axios');

const BASE_URL = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

const getAccessToken = async () => {
  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');
  const { data } = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );
  return data.access_token;
};

const getLNMPassword = () => {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const raw = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  return { password: Buffer.from(raw).toString('base64'), timestamp };
};

const stkPush = async ({ phone, amount, accountRef, description }) => {
  const token = await getAccessToken();
  const { password, timestamp } = getLNMPassword();
  const normalized = phone
    .replace(/\s+/g, '')
    .replace(/^0/, '254')
    .replace(/^\+/, '');

  const { data } = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(amount),
      PartyA:            normalized,
      PartyB:            process.env.MPESA_SHORTCODE,
      PhoneNumber:       normalized,
      CallBackURL:       process.env.MPESA_CALLBACK_URL,
      AccountReference:  accountRef || 'SAM-LiMP',
      TransactionDesc:   description || 'SAM-LiMP Payment',
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
};

module.exports = { stkPush, getAccessToken };
