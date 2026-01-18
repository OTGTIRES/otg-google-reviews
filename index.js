require("dotenv").config();
const express = require("express");
const cors = require("cors");
const NodeCache = require("node-cache");
const { google } = require("googleapis");

const app = express();
app.use(cors());

const cache = new NodeCache({ stdTTL: 21600 }); // 6 hours

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Health check
app.get("/", (req, res) => {
  res.send("OTG Google Reviews API running");
});

// OAuth start
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/business.manage"],
    prompt: "consent",
  });
  res.redirect(url);
});

// OAuth callback
app.get("/oauth2callback", async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    cache.set("tokens", tokens);
    res.send("Authorization successful. You can close this tab.");
  } catch (err) {
    res.status(500).send("Auth failed");
  }
});

// Fetch reviews
app.get("/reviews", async (req, res) => {
  try {
    const cached = cache.get("reviews");
    if (cached) return res.json(cached);

    const tokens = cache.get("tokens");
    if (!tokens) return res.status(401).send("Not authorized");

    oauth2Client.setCredentials(tokens);

    const business = google.mybusinessbusinessinformation({
      version: "v1",
      auth: oauth2Client,
    });

    const accounts = await business.accounts.list();
    const accountName = accounts.data.accounts[0].name;

    const locations = await business.accounts.locations.list({
      parent: accountName,
      readMask: "name",
    });

    const locationName = locations.data.locations[0].name;

    const reviewsApi = google.mybusinessreviews({
      version: "v1",
      auth: oauth2Client,
    });

    const reviews = await reviewsApi.accounts.locations.reviews.list({
      parent: locationName,
    });

    cache.set("reviews", reviews.data.reviews);
    res.json(reviews.data.reviews);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching reviews");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
