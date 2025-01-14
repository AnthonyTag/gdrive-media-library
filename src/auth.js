/**
 * Express Router setup for Google OAuth2 authentication.
 */
const express = require('express');
const fs = require('fs');
const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config(); // Load environment variables from .env file

const router = express.Router();

// Constants
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;
const TOKEN_PATH = 'tokens.json';

// Initialize OAuth2 client
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

/**
 * Load saved tokens into OAuth2 client if available.
 */
function loadTokens() {
    try {
        const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oAuth2Client.setCredentials(tokens);
        console.log('Tokens loaded from file.');
    } catch (error) {
        console.log('No tokens found. Please authenticate via /auth.');
    }
}

/**
 * Save tokens to file.
 * @param {object} tokens - The tokens to save.
 */
function saveTokens(tokens) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log('Tokens saved to file.');
}

/**
 * GET /auth - Redirect user to Google OAuth2 authentication page.
 */
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
    res.redirect(authUrl);
});

/**
 * GET /callback - Handle OAuth2 callback and save tokens.
 */
router.get('/callback', async (req, res) => {
    const code = req.query.code;

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        saveTokens(tokens);
        res.redirect('/');
    } catch (error) {
        console.error('Error during authentication:', error);
        res.status(400).send('Error during authentication');
    }
});

/**
 * GET /status - Check if the user is authenticated.
 */
router.get('/status', (req, res) => {
    try {
        const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        res.json({ authenticated: !!tokens });
    } catch (error) {
        res.json({ authenticated: false });
    }
});

/**
 * GET /profile - Fetch and return the user's profile information.
 */
router.get('/profile', async (req, res) => {
    try {
        const oauth2 = google.oauth2({ auth: oAuth2Client, version: 'v2' });
        const userInfo = await oauth2.userinfo.get();
        res.json({ name: userInfo.data.name });
    } catch (error) {
        console.error('Error fetching profile information:', error);
        res.status(400).json({ error: 'Unable to fetch profile information' });
    }
});

/**
 * Event listener for token refresh.
 */
oAuth2Client.on('tokens', (tokens) => {
    console.log('Tokens refreshed:', tokens);
    if (tokens.refresh_token) {
        saveTokens(tokens);
    }
});

// Load tokens on startup
loadTokens();

module.exports = { router, oAuth2Client };
