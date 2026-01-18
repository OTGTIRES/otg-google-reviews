require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const NodeCache = require('node-cache');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ----------------------
// TOKEN CACHE
// ----------------------
const tokenCache = new NodeCache({ stdTTL: 3600 * 24 }); // cache token for 24h

// ----------------------
// GOOGLE BUSINESS PROFILE IDS
// ----------------------
const ACCOUNT_ID = '15209761812700196433'; // Your Business Profile ID
const LOCATION_ID = '16343617315798725542'; // Your Location ID (Store code)

// ----------------------
// GOOGLE OAUTH CLIENT
// ----------------------
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ----------------------
// ROUTE: Start OAuth
// ----------------------
app.get('/auth', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/business.manage'],
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

// ----------------------
// ROUTE: OAuth Callback
// ----------------------
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code provided');

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    tokenCache.set('google_token', tokens); // cache token
    console.log('OAuth tokens saved');
    res.send('Authorization successful. You can close this tab.');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authorization failed');
  }
});

// ----------------------
// ROUTE: Fetch Reviews
// ----------------------
app.get('/reviews', async (req, res) => {
  try {
    const cachedToken = tokenCache.get('google_token');
    if (!cachedToken) return res.status(401).send('Not authorized. Visit /auth first.');

    oAuth2Client.setCredentials(cachedToken);

    // Use the correct Business Profile Performance API
    const businessprofile = google.businessprofileperformance({
      version: 'v1',
      auth: oAuth2Client
    });

    console.log('Fetching reviews for:', `accounts/${ACCOUNT_ID}/locations/${LOCATION_ID}`);

    const response = await businessprofile.accounts.locations.reviews.list({
      parent: `accounts/${ACCOUNT_ID}/locations/${LOCATION_ID}`
    });

    const reviews = response.data.reviews || [];

    // Format reviews
    const formatted = reviews.map(r => ({
      author: r.reviewer?.displayName || 'Anonymous',
      rating: r.starRating,
      comment: r.comment || '',
      createTime: r.createTime
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).send('Error fetching reviews');
  }
});

// ----------------------
// START SERVER
// ----------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
