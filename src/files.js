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

let globalTagList = [];

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
        fields: 'files(id, name, thumbnailLink, webContentLink, webViewLink, createdTime, mimeType, size, appProperties)',
    });

    return response.data.files.map((file) => ({
        ...file,
        tags: file.appProperties?.tags ? file.appProperties.tags.split(',') : [],
        backendSyncStatus: 'synced', // Explicitly set backendSyncStatus
    }));
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
 * Update the global tag list by aggregating tags from all files.
 * @param {Array} files - Array of file objects.
 */
function updateGlobalTagList(files) {
    const allTags = files.flatMap((file) => file.tags || []);
    globalTagList = [...new Set(allTags)]; // Remove duplicates
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
 * GET /search - Search for files in Google Drive with substring matching.
 */
router.get('/search', async (req, res) => {
    const { query, showTrashed = 'false' } = req.query;

    if (!query) {
        return res.status(400).send('Search query is required');
    }

    const driveQuery = `'${folderId}' in parents and trashed = ${showTrashed}`;

    try {
        // Fetch all files from Google Drive within the folder
        const files = await fetchFilesFromDrive(driveQuery);

        // Perform substring filtering locally
        const filteredFiles = files.filter((file) => file.name.toLowerCase().includes(query.toLowerCase()));

        res.json(filteredFiles);
    } catch (error) {
        console.error('Error searching files:', error);
        res.status(500).send('Error searching files');
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
 * POST /update-tags - Update tags for a file.
 * @param {string} fileId - The ID of the file.
 * @param {string} action - The action to perform ('add' or 'remove').
 * @param {string} tag - The tag to add or remove.
 */
router.post('/update-tags', async (req, res) => {
    const { fileId, action, tag } = req.body;

    if (!fileId || !action || !tag) {
        return res.status(400).send('File ID, action, and tag are required');
    }

    try {
        const drive = getDriveInstance();

        // Get existing tags
        const file = await drive.files.get({
            fileId,
            fields: 'appProperties',
        });

        const existingTags = file.data.appProperties?.tags
            ? file.data.appProperties.tags.split(',')
            : [];

        // Modify tags based on the action
        let updatedTags;
        if (action === 'add') {
            if (existingTags.includes(tag)) {
                return res.status(200).json({
                    message: `Tag "${tag}" already exists. No changes made.`,
                    tags: existingTags,
                    backendSyncStatus: 'synced', // Indicate no changes needed
                });
            }
            updatedTags = [...existingTags, tag];
        } else if (action === 'remove') {
            if (!existingTags.includes(tag)) {
                return res.status(200).json({
                    message: `Tag "${tag}" does not exist. No changes made.`,
                    tags: existingTags,
                    backendSyncStatus: 'synced', // Indicate no changes needed
                });
            }
            updatedTags = existingTags.filter((t) => {
                return t !== tag;
            });

        } else {
            return res.status(400).send('Invalid action or tag already exists');
        }

        // Update file metadata in Google Drive
        if (updatedTags.length === 0) {
            console.log('Clearing appProperties for file:', fileId);
            await drive.files.update({
                fileId,
                requestBody: {
                    appProperties: { tags: null },
                },
            });
        } else {
            console.log('Updating appProperties with tags:', updatedTags.join(','));
            await drive.files.update({
                fileId,
                requestBody: {
                    appProperties: { tags: updatedTags.join(',') },
                },
            });
        }

        // Fetch the updated file metadata after the update
        const updatedFile = await drive.files.get({
            fileId,
            fields: 'appProperties',
        });
        console.log('Updated tags in Drive:', updatedFile.data.appProperties?.tags || 'No tags');

        res.status(200).json({
            message: 'Tags updated successfully',
            tags: updatedFile.data.appProperties?.tags?.split(',') || [],
            backendSyncStatus: 'synced', // Indicate successful sync
        });
    } catch (error) {
        console.error('Error updating tags:', error.message, error.response?.data);

        if (!res.headersSent) {
            res.status(500).send(`Error updating tags: ${error.message}`);
        }
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
