const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const authRouter = require('./auth').router; // Import the auth router
const filesRouter = require('./files');     // Import the files router

dotenv.config(); // Load environment variables from .env file

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Routes
app.use('/', authRouter); // Mount the auth router
app.use('/', filesRouter); // Mount the files router

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
