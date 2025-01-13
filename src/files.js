const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const { google } = require('googleapis');
const { oAuth2Client } = require('./auth');

const router = express.Router();
const upload = multer({ dest: 'uploads-temp/' }); // Set the uploads directory
const folderId = '18vySb3kWlLmnYPRdA9wbpzN0Q61jKkhc';

// Fetch Files from a Specific Folder
router.get('/files', async (req, res) => {
    const folderId = '18vySb3kWlLmnYPRdA9wbpzN0Q61jKkhc'; // Folder ID
    const showTrashed = req.query.showTrashed === 'true'; // Check for optional query parameter

    try {
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });
        const query = `'${folderId}' in parents and trashed = ${showTrashed}`; // Dynamically include trashed filter
        console.log('Query:', query); // Log query for debugging

        const response = await drive.files.list({
            q: query,
            pageSize: 100,
            fields: 'files(id, name, thumbnailLink, webContentLink, webViewLink, createdTime, mimeType, size)',
        });

        res.send(response.data.files);
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(400).send('Error fetching files');
    }
});

// Proxy Route for Fetching Thumbnails
router.get('/thumbnail/:fileId', async (req, res) => {
    const fileId = req.params.fileId;

    try {
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });
        const response = await drive.files.get({
            fileId,
            fields: 'thumbnailLink',
        });

        const thumbnailLink = response.data.thumbnailLink;

        if (thumbnailLink) {
            const thumbnailResponse = await axios.get(thumbnailLink, { responseType: 'arraybuffer' });
            res.set('Content-Type', thumbnailResponse.headers['content-type']);
            res.send(thumbnailResponse.data);
        } else {
            res.status(404).send('Thumbnail not found');
        }
    } catch (error) {
        console.error('Error fetching thumbnail:', error);
        res.status(500).send('Error fetching thumbnail');
    }
});

// Search route
router.get('/search', async (req, res) => {
    const { query, showTrashed } = req.query;

    if (!query) {
        return res.status(400).send('Search query is required');
    }

    const trashed = showTrashed === 'true'; // Convert to boolean

    try {
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });

        // Search for files with the specified trashed state
        const response = await drive.files.list({
            q: `'${folderId}' in parents and name contains '${query}' and trashed = ${trashed}`,
            fields: 'files(id, name, thumbnailLink, webContentLink, webViewLink, createdTime, mimeType, size)',
            pageSize: 100,
        });

        console.log(`Search results for query "${query}" with trashed = ${trashed}:`, response.data.files);
        res.status(200).send(response.data.files);
    } catch (error) {
        console.error('Error searching files:', error.message);
        res.status(500).send('Error searching files');
    }
});

// Handle multiple file uploads
router.post('/upload', upload.array('files', 10), async (req, res) => {
    try {
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });

        const uploadPromises = req.files.map((file) => {
            const fileMetadata = {
                name: file.originalname,
                parents: [folderId], // Ensure files are uploaded to the correct folder
            };
            const media = {
                mimeType: file.mimetype,
                body: fs.createReadStream(file.path),
            };

            console.log('Uploading file to Google Drive:', file.originalname); // Log file being uploaded

            return drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id',
            });
        });

        const fileIds = await Promise.all(uploadPromises);
        
        res.status(200).json({ message: 'Files uploaded successfully!', fileIds });
    } catch (error) {
        console.error('Error handling file upload:', error);
        res.status(500).json({ error: 'Error uploading files.' });
    } finally {
        req.files.forEach((file) => {
            fs.unlink(file.path, (err) => {
                if (err) {
                    console.error(`Error deleting temp file ${file.path}:`, err);
                } else {
                    console.log(`Temp file ${file.path} deleted successfully.`);
                }
            });
        });
    }
});

// Trash file
router.post('/trash-file', async (req, res) => {
    const { fileId } = req.body; // Get file ID from the request body

    if (!fileId) {
        return res.status(400).send('File ID is required');
    }

    try {
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });

        // Mark the file as trashed
        await drive.files.update({
            fileId,
            requestBody: {
                trashed: true,
            },
        });

        console.log(`File ${fileId} moved to trash`);
        res.status(200).send('File moved to trash');
    } catch (error) {
        console.error(`Error moving file ${fileId} to trash:`, error);
        res.status(500).send('Error moving file to trash');
    }
});

// Delete file permanently
router.post('/delete-file', async (req, res) => {
    const { fileId } = req.body; // Get file ID from the request body

    if (!fileId) {
        return res.status(400).send('File ID is required');
    }

    try {
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });

        // Permanently delete the file
        await drive.files.delete({
            fileId,
        });

        console.log(`File ${fileId} permanently deleted`);
        res.status(200).send('File permanently deleted');
    } catch (error) {
        console.error(`Error permanently deleting file ${fileId}:`, error);
        res.status(500).send('Error permanently deleting file');
    }
});

// Restore file
router.post('/restore-file', async (req, res) => {
    const { fileId } = req.body; // Get file ID from the request body

    if (!fileId) {
        return res.status(400).send('File ID is required');
    }

    try {
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });

        // Restore the file by un-trashing it
        await drive.files.update({
            fileId,
            requestBody: {
                trashed: false,
            },
        });

        console.log(`File ${fileId} restored from trash`);
        res.status(200).send('File restored');
    } catch (error) {
        console.error(`Error restoring file ${fileId}:`, error);
        res.status(500).send('Error restoring file');
    }
});

module.exports = router;
