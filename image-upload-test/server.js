const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const IMAGEKIT_PUBLIC_KEY = (
  process.env.IMAGEKIT_PUBLIC_KEY || 'public_jpEx/dw67NGCiUV4E/WJ7s3iGMU='
).trim();
const IMAGEKIT_PRIVATE_KEY = (
  process.env.IMAGEKIT_PRIVATE_KEY || 'private_Cpq5HNeAfw1NjCE/kg7ugXoI48s='
).trim();
const IMAGEKIT_URL_ENDPOINT = (
  process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/kikim1982'
).trim();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/imagekit-auth', (_req, res) => {
  try {
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 600;
    const signature = crypto
      .createHmac('sha1', IMAGEKIT_PRIVATE_KEY)
      .update(token + expire)
      .digest('hex');

    res.json({
      success: true,
      data: {
        token,
        expire,
        signature,
        publicKey: IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: IMAGEKIT_URL_ENDPOINT,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate ImageKit auth parameters',
    });
  }
});

app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  res.status(404).json({ success: false, message: 'Not found' });
});

if (require.main === module) {
  app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`)
  );
}
module.exports = app;
