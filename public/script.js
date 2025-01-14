document.addEventListener('DOMContentLoaded', async () => {
    // Elements
    const authButton = document.getElementById('authButton');
    const fileList = document.getElementById('fileList');
    const accountName = document.getElementById('accountName');

    const sortSelect = document.getElementById('sortSelect');
    const sortOrderButton = document.getElementById('sortOrderButton');
    const viewTrashButton = document.getElementById('viewTrashButton');

    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const clearSearchButton = document.getElementById('clearSearchButton');

    const uploadButton = document.getElementById('uploadButton');
    const fileInput = document.createElement('input');
    
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // State Variables
    let sortOrder = 'asc';
    let viewingTrash = false;
    let currentSearchQuery = '';

    /**
     * Check authentication status and handle UI updates accordingly.
     */
    async function checkAuthStatus() {
        try {
            const response = await fetch('/status');
            const data = await response.json();

            if (data.authenticated) {
                authButton.style.display = 'none';
                await fetchProfile();
                await fetchFiles();
            } else {
                authButton.style.display = 'block';
                authButton.addEventListener('click', redirectToAuth);
            }
        } catch (error) {
            console.error('Error checking authentication status:', error);
        }
    }

    /**
     * Redirect user to the authentication route.
     */
    function redirectToAuth() {
        window.location.href = '/auth';
    }

    /**
     * Fetch and display user profile information.
     */
    async function fetchProfile() {
        try {
            const response = await fetch('/profile');
            const data = await response.json();
            accountName.textContent = `Logged in as: ${data.name}`;
        } catch (error) {
            console.error('Error fetching profile:', error);
            accountName.textContent = 'Unable to fetch user profile';
        }
    }

    /**
     * Fetch files from the server and sort them.
     * @param {string} sortBy - The field to sort by (default: 'createdTime').
     */
    async function fetchFiles(sortBy = 'createdTime') {
        try {
            console.log(`Fetching files: sortBy=${sortBy}, viewingTrash=${viewingTrash}`);
            const endpoint = getFetchEndpoint();
            console.log('Fetching from endpoint:', endpoint);
    
            const response = await fetch(endpoint);
            console.log('Response:', response);
    
            if (!response.ok) {
                throw new Error(`Fetch failed with status ${response.status}`);
            }
    
            let files = await response.json();
            console.log('Fetched files:', files);
    
            files = sortFiles(files, sortBy);
            populateFileList(files);
        } catch (error) {
            console.error('Error fetching files:', error);
            fileList.innerHTML = '<p>Unable to load files.</p>';
        }
    }

    /**
     * Construct the fetch endpoint based on the current state.
     * @returns {string} - The constructed endpoint URL.
     */
    function getFetchEndpoint() {
        console.log("current search query: ", currentSearchQuery);
        return currentSearchQuery
            ? `/search?query=${encodeURIComponent(currentSearchQuery)}&showTrashed=${viewingTrash}`
            : `/files?showTrashed=${viewingTrash}`;
    }

    /**
     * Sort files based on a specified field and order.
     * @param {Array} files - The array of file objects to sort.
     * @param {string} sortBy - The field to sort by.
     * @returns {Array} - The sorted array of files.
     */
    function sortFiles(files, sortBy) {
        return files.sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'size':
                    comparison = (a.size || 0) - (b.size || 0);
                    break;
                case 'type':
                    comparison = a.mimeType.localeCompare(b.mimeType);
                    break;
                default:
                    comparison = new Date(a.createdTime) - new Date(b.createdTime);
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });
    }

    /**
     * Populate the file list in the DOM.
     * @param {Array} files - The array of file objects to display.
     */
    function populateFileList(files) {
        fileList.innerHTML = '';
        files.forEach((file) => {
            const fileItem = createFileItem(file);
            fileList.appendChild(fileItem);
        });
    }

    /**
     * Create a file item element for the file list.
     * @param {Object} file - The file object to create an element for.
     * @returns {HTMLElement} - The file item element.
     */
    function createFileItem(file) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        const thumbnail = document.createElement('img');
        thumbnail.src = `/thumbnail/${file.id}`;
        thumbnail.alt = file.name;
        thumbnail.className = 'thumbnail';
        thumbnail.onerror = () => {
            thumbnail.src = 'default-thumbnail.png';
        };

        const fileName = document.createElement('span');
        fileName.textContent = file.name;

        const actions = createFileActions(file);

        fileItem.appendChild(thumbnail);
        fileItem.appendChild(fileName);
        fileItem.appendChild(actions);
        return fileItem;
    }

    /**
     * Create action buttons for a file item.
     * @param {Object} file - The file object.
     * @returns {HTMLElement} - The container with action buttons.
     */
    function createFileActions(file) {
        const actions = document.createElement('div');
        actions.className = 'file-actions';

        if (viewingTrash) {
            actions.appendChild(createRestoreButton(file));
            actions.appendChild(createDeleteForeverButton(file));
        } else {
            actions.appendChild(createDownloadButton(file));
            actions.appendChild(createViewButton(file));
            actions.appendChild(createTrashButton(file));
        }

        return actions;
    }

    async function onFileInputChange(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                alert('Files uploaded successfully!');
                // Optionally, refresh the file list
                fetchFiles();
            } else {
                alert('Error uploading files. Please try again.');
            }
        } catch (error) {
            console.error('Error uploading files:', error);
            alert('Error uploading files. Please check the console for details.');
        }
    }

    /**
     * Create a "Download" button for a file.
     * @param {Object} file - The file object containing metadata.
     * @returns {HTMLElement} - The download button element.
     */
    function createDownloadButton(file) {
        const downloadButton = document.createElement('a');
        downloadButton.href = file.webContentLink;
        downloadButton.target = '_blank';
        downloadButton.className = 'file-action';
        downloadButton.textContent = 'Download';
        return downloadButton;
    }

    /**
     * Create a "View in Drive" button for a file.
     * @param {Object} file - The file object containing metadata.
     * @returns {HTMLElement} - The view button element.
     */
    function createViewButton(file) {
        const viewButton = document.createElement('a');
        viewButton.href = file.webViewLink;
        viewButton.target = '_blank';
        viewButton.className = 'file-action';
        viewButton.textContent = 'Open in Drive';
        return viewButton;
    }

    /**
     * Create a "Trash" button for a file.
     * @param {Object} file - The file object containing metadata.
     * @returns {HTMLElement} - The trash button element.
     */
    function createTrashButton(file) {
        const trashButton = document.createElement('button');
        trashButton.className = 'file-action trash-button';
        trashButton.textContent = 'Trash';
        trashButton.addEventListener('click', async () => {
            try {
                const response = await fetch('/trash-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileId: file.id }),
                });

                if (response.ok) {
                    console.log(`File ${file.id} trashed successfully`);
                    fetchFiles(); // Refresh the file list
                } else {
                    throw new Error('Failed to trash the file');
                }
            } catch (error) {
                console.error(`Error trashing file ${file.id}:`, error);
                alert('Failed to trash the file. Please try again.');
            }
        });
        return trashButton;
    }

    /**
     * Create a "Restore" button for a file.
     * @param {Object} file - The file object containing metadata.
     * @returns {HTMLElement} - The restore button element.
     */
    function createRestoreButton(file) {
        const restoreButton = document.createElement('button');
        restoreButton.className = 'file-action restore-button';
        restoreButton.textContent = 'Restore';
        restoreButton.addEventListener('click', async () => {
            try {
                const response = await fetch('/restore-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileId: file.id }),
                });

                if (response.ok) {
                    console.log(`File ${file.id} restored successfully`);
                    fetchFiles(); // Refresh the file list
                } else {
                    throw new Error('Failed to restore the file');
                }
            } catch (error) {
                console.error(`Error restoring file ${file.id}:`, error);
                alert('Failed to restore the file. Please try again.');
            }
        });
        return restoreButton;
    }

    /**
     * Create a "Delete Forever" button for a file.
     * @param {Object} file - The file object containing metadata.
     * @returns {HTMLElement} - The delete forever button element.
     */
    function createDeleteForeverButton(file) {
        const deleteForeverButton = document.createElement('button');
        deleteForeverButton.className = 'file-action trash-button';
        deleteForeverButton.style.backgroundColor = '#dc3545'; // Red color for delete
        deleteForeverButton.textContent = 'Delete Forever';
        deleteForeverButton.addEventListener('click', async () => {
            const confirmation = confirm(
                `Are you sure you want to permanently delete the file "${file.name}"? This action cannot be undone.`
            );

            if (!confirmation) {
                return; // Exit if the user cancels
            }

            try {
                const response = await fetch('/delete-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileId: file.id }),
                });

                if (response.ok) {
                    console.log(`File ${file.id} deleted forever`);
                    fetchFiles(); // Refresh the file list
                } else {
                    throw new Error('Failed to delete the file');
                }
            } catch (error) {
                console.error(`Error deleting file ${file.id}:`, error);
                alert('Failed to delete the file. Please try again.');
            }
        });
        return deleteForeverButton;
    }

    /**
     * Initialize event listeners for the UI.
     */
    function initializeEventListeners() {
        viewTrashButton.addEventListener('click', toggleTrashView);
        sortSelect.addEventListener('change', (event) => fetchFiles(event.target.value));
        sortOrderButton.addEventListener('click', toggleSortOrder);
        
        // Trigger search on button click
        searchButton.addEventListener('click', () => {
            currentSearchQuery = searchInput.value.trim();
            fetchFiles(sortSelect.value);
        });      
        
        // Trigger search on Enter key press
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                currentSearchQuery = searchInput.value.trim();
                fetchFiles(sortSelect.value);
            }
        });

        // Clear search input
        clearSearchButton.addEventListener('click', () => {
            currentSearchQuery = '';
            searchInput.value = '';
            fetchFiles(sortSelect.value);
        });

        uploadButton.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', onFileInputChange);
    }

    /**
     * Toggle the trash view.
     */
    function toggleTrashView() {
        viewingTrash = !viewingTrash;
        viewTrashButton.textContent = viewingTrash ? 'View Active Files' : 'View Trash';
        fetchFiles(sortSelect.value);
    }

    /**
     * Toggle the sort order between ascending and descending.
     */
    function toggleSortOrder() {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        sortOrderButton.textContent = sortOrder === 'asc' ? 'Ascending' : 'Descending';
        fetchFiles(sortSelect.value);
    }

    // Initialize
    initializeEventListeners();
    checkAuthStatus();
});
