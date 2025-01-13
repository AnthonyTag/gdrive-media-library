const express = require('express');
const fs = require('fs');
const { google } = require('googleapis');

const router = express.Router();

const dotenv = require('dotenv');
dotenv.config(); // Ensure this is called to load .env variables

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
    CLIENT_ID, 
    CLIENT_SECRET, 
    REDIRECT_URI
);

// Log the Redirect URI for debugging
console.log('Redirect URI:', process.env.REDIRECT_URI);

// Load tokens from file on startup, if available
try {
    const tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
    oAuth2Client.setCredentials(tokens);
    console.log('Tokens loaded from file.');
} catch (error) {
    console.log('No tokens found, please authenticate via /auth.');
}

// Generate Auth URL and redirect the user
router.get('/auth', (req, res) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
        ],
    });

    // Redirect the user to the Google OAuth authentication page
    res.redirect(authUrl);
});

// Handle Callback and Save Tokens
router.get('/callback', async (req, res) => {
    const code = req.query.code;
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        // Save tokens to file for future use
        fs.writeFileSync('tokens.json', JSON.stringify(tokens));
        console.log('Tokens saved:', tokens);

        res.redirect('/');
    } catch (error) {
        console.error('Error during authentication:', error);
        res.status(400).send('Error during authentication');
    }
});

// Check Authentication Status
router.get('/status', (req, res) => {
    try {
        const tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
        if (tokens) {
            return res.json({ authenticated: true });
        }
    } catch (error) {
        // No tokens found
    }
    res.json({ authenticated: false });
});

// Fetch User Profile
router.get('/profile', async (req, res) => {
    try {
        const oauth2 = google.oauth2({
            auth: oAuth2Client,
            version: 'v2',
        });

        const userInfo = await oauth2.userinfo.get();
        res.json({ name: userInfo.data.name });
    } catch (error) {
        console.error('Error fetching profile information:', error);
        res.status(400).json({ error: 'Unable to fetch profile information' });
    }
});

// Refresh Tokens
oAuth2Client.on('tokens', (tokens) => {
    console.log('Tokens refreshed:', tokens);
    if (tokens.refresh_token) {
        // Save the new refresh token
        fs.writeFileSync('tokens.json', JSON.stringify(tokens));
        console.log('Updated tokens saved.');
    }
});

module.exports = { router, oAuth2Client };
