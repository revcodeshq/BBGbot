// captcha-helper.js
const axios = require('axios');
const crypto = require('crypto');
const { get } = require('./config');

const BASE_URL = 'https://wos-giftcode-api.centurygame.com/api';

// Build signed form (same as before)
function buildSignedForm(params) {
  const sortedKeys = Object.keys(params).sort();
  const SECRET = get('api.wosApiSecret');
  const query = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + SECRET;
  const sign = crypto.createHash('md5').update(query).digest('hex');

  const body = new URLSearchParams();
  for (const k of sortedKeys) body.append(k, params[k]);
  body.append('sign', sign);
  return body;
}

/**
 * Fetch captcha image from API.
 * Returns { buffer, mime } or throws.
 */
async function fetchCaptcha() {
  // The captcha endpoint in the HAR is POST /api/captcha
  // Some servers expect a time param, but HAR shows it works without extras.
  const params = { time: String(Date.now()) }; // include time if server expects it
  const body = buildSignedForm(params);

  const res = await axios.post(`${BASE_URL}/captcha`, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://wos-giftcode.centurygame.com',
      'Referer': 'https://wos-giftcode.centurygame.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0'
    },
    timeout: 15000
  });

  if (!res.data || res.data.code !== 0) {
    throw new Error('Failed to fetch captcha: ' + JSON.stringify(res.data));
  }

  // res.data.data.img looks like: data:image/jpeg;base64,/...
  const dataUrl = res.data.data?.img;
  if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('Invalid captcha image');

  // parse data URL
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/);
  if (!match) throw new Error('Unsupported data URL format for captcha');

  const mime = match[1];
  const b64 = match[2];
  const buffer = Buffer.from(b64, 'base64');

  return { buffer, mime, rawDataUrl: dataUrl };
}

module.exports = { fetchCaptcha };
