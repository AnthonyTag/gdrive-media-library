/**
 * Express Router setup for file-related operations with Google Drive.
 */
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const { google } = require('googleapis');
const { oAuth2Client } = require('./auth');

const router = express.Router();
const upload = multer({ dest: 'uploads-temp/' }); // Temporary file upload directory

// Constants
const folderId = '18vySb3kWlLmnYPRdA9wbpzN0Q61jKkhc';

/**
 * Initialize Google Drive API instance.
 * @returns {google.drive_v3.Drive} - Authenticated Drive instance.
 */
function getDriveInstance() {
    return google.drive({ version: 'v3', auth: oAuth2Client });
}

/**
 * Fetch files from Google Drive.
 * @param {string} query - Query string to filter files.
 * @returns {Promise<Array>} - List of files.
 */
async function fetchFilesFromDrive(query) {
    const drive = getDriveInstance();
    const response = await drive.files.list({
        q: query,
        pageSize: 100,
        fields: 'files(id, name, thumbnailLink, webContentLink, webViewLink, createdTime, mimeType, size)',
    });
    return response.data.files;
}

/**
 * Delete temporary uploaded files.
 * @param {Array} files - Array of file objects.
 */
function cleanupTempFiles(files) {
    files.forEach((file) => {
        fs.unlink(file.path, (err) => {
            if (err) {
                console.error(`Error deleting temp file ${file.path}:`, err);
            } else {
                console.log(`Temp file ${file.path} deleted successfully.`);
            }
        });
    });
}

/**
 * GET /files - Fetch files from a specific folder.
 */
router.get('/files', async (req, res) => {
    const showTrashed = req.query.showTrashed === 'true';
    const query = `'${folderId}' in parents and trashed = ${showTrashed}`;

    try {
        const files = await fetchFilesFromDrive(query);
        res.json(files);
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(400).send('Error fetching files');
    }
});

/**
 * GET /thumbnail/:fileId - Fetch a file thumbnail.
 */
router.get('/thumbnail/:fileId', async (req, res) => {
    const fileId = req.params.fileId;

    try {
        const drive = getDriveInstance();
        const response = await drive.files.get({ fileId, fields: 'thumbnailLink' });

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

/**
 * POST /upload - Upload multiple files to Google Drive.
 */
router.post('/upload', upload.array('files', 10), async (req, res) => {
    const drive = getDriveInstance();

    try {
        const uploadPromises = req.files.map((file) => {
            const fileMetadata = {
                name: file.originalname,
                parents: [folderId],
            };
            const media = {
                mimeType: file.mimetype,
                body: fs.createReadStream(file.path),
            };

            return drive.files.create({
                resource: fileMetadata,
                media,
                fields: 'id',
            });
        });

        const results = await Promise.all(uploadPromises);
        res.status(200).json({ message: 'Files uploaded successfully!', results });
    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(500).json({ error: 'Error uploading files.' });
    } finally {
        cleanupTempFiles(req.files);
    }
});

/**
 * POST /trash-file - Move a file to trash.
 */
router.post('/trash-file', async (req, res) => {
    const { fileId } = req.body;

    if (!fileId) {
        return res.status(400).send('File ID is required');
    }

    try {
        const drive = getDriveInstance();
        await drive.files.update({ fileId, requestBody: { trashed: true } });
        res.status(200).send('File moved to trash');
    } catch (error) {
        console.error(`Error moving file ${fileId} to trash:`, error);
        res.status(500).send('Error moving file to trash');
    }
});

/**
 * POST /delete-file - Permanently delete a file.
 */
router.post('/delete-file', async (req, res) => {
    const { fileId } = req.body;

    if (!fileId) {
        return res.status(400).send('File ID is required');
    }

    try {
        const drive = getDriveInstance();
        await drive.files.delete({ fileId });
        res.status(200).send('File permanently deleted');
    } catch (error) {
        console.error(`Error deleting file ${fileId}:`, error);
        res.status(500).send('Error deleting file');
    }
});

/**
 * POST /restore-file - Restore a file from trash.
 */
router.post('/restore-file', async (req, res) => {
    const { fileId } = req.body;

    if (!fileId) {
        return res.status(400).send('File ID is required');
    }

    try {
        const drive = getDriveInstance();
        await drive.files.update({ fileId, requestBody: { trashed: false } });
        res.status(200).send('File restored');
    } catch (error) {
        console.error(`Error restoring file ${fileId}:`, error);
        res.status(500).send('Error restoring file');
    }
});

module.exports = router;
