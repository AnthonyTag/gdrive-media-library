document.addEventListener('DOMContentLoaded', async () => {
    const authButton = document.getElementById('authButton');
    const fileList = document.getElementById('fileList');
    const accountName = document.getElementById('accountName');

    const sortSelect = document.getElementById('sortSelect');
    const sortOrderButton = document.getElementById('sortOrderButton');
    const viewTrashButton = document.getElementById('viewTrashButton');

    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const clearSearchButton = document.getElementById('clearSearchButton');

    let sortOrder = 'asc'; // Default to ascending order
    let viewingTrash = false; // Toggle for viewing trash
    let currentSearchQuery = ''; // Track the current search query

    // Check authentication status
    async function checkAuthStatus() {
        try {
            const response = await fetch('/status');
            const data = await response.json();

            if (data.authenticated) {
                authButton.style.display = 'none'; // Hide the button if authenticated
                fetchProfile(); // Fetch and display user profile
                fetchFiles(); // Fetch files with default settings
            } else {
                authButton.style.display = 'block'; // Show the button if not authenticated
                authButton.addEventListener('click', () => {
                    window.location.href = '/auth'; // Redirect to the authentication route
                });
            }
        } catch (error) {
            console.error('Error checking authentication status:', error);
        }
    }

    // Fetch user profile
    async function fetchProfile() {
        try {
            const response = await fetch('/profile');
            if (!response.ok) throw new Error('Failed to fetch profile');

            const data = await response.json();
            accountName.textContent = `Logged in as: ${data.name}`;
        } catch (error) {
            console.error('Error fetching profile:', error);
            accountName.textContent = 'Unable to fetch user profile';
        }
    }

    // Fetch and display files
    async function fetchFiles(sortBy = 'createdTime') {
        try {
            console.log(`Fetching files with sort: ${sortBy}, order: ${sortOrder}`);
            console.log(`Fetching files: Viewing Trash = ${viewingTrash}, Search Query = "${currentSearchQuery}"`);

            // Determine the endpoint
            const endpoint = currentSearchQuery
                ? `/search?query=${encodeURIComponent(currentSearchQuery)}&showTrashed=${viewingTrash}`
                : `/files?showTrashed=${viewingTrash}`;

            const response = await fetch(endpoint);
            if (!response.ok) throw new Error('Failed to fetch files');

            let files = await response.json();
            console.log('Fetched files:', files);

            // Sort files based on the selected criteria and order
            files.sort((a, b) => {
                let comparison = 0;
                if (sortBy === 'name') {
                    comparison = a.name.localeCompare(b.name);
                } else if (sortBy === 'size') {
                    comparison = (a.size || 0) - (b.size || 0); // Handle undefined sizes
                } else if (sortBy === 'type') {
                    comparison = a.mimeType.localeCompare(b.mimeType);
                } else {
                    comparison = new Date(a.createdTime) - new Date(b.createdTime); // Default: creation date
                }

                return sortOrder === 'asc' ? comparison : -comparison; // Flip for descending
            });

            // Populate the file list
            populateFileList(files);
        } catch (error) {
            console.error('Error fetching files:', error);
            fileList.innerHTML = '<p>Unable to load files.</p>';
        }
    }

    function populateFileList(files) {
        fileList.innerHTML = ''; // Clear the current file list
        files.forEach((file) => {
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

            const actions = document.createElement('div');
            actions.className = 'file-actions';

            const downloadButton = document.createElement('a');
            downloadButton.href = file.webContentLink;
            downloadButton.target = '_blank';
            downloadButton.className = 'file-action';
            downloadButton.textContent = 'Download';

            const viewButton = document.createElement('a');
            viewButton.href = file.webViewLink;
            viewButton.target = '_blank';
            viewButton.className = 'file-action';
            viewButton.textContent = 'Open in Drive';

            actions.appendChild(downloadButton);
            actions.appendChild(viewButton);

            if (viewingTrash) {
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
                actions.appendChild(restoreButton);
            } else {
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
                actions.appendChild(trashButton);
            }

            fileItem.appendChild(thumbnail);
            fileItem.appendChild(fileName);
            fileItem.appendChild(actions);
            fileList.appendChild(fileItem);
        });
    }

    // Handle toggle between trash and non-trash views
    viewTrashButton.addEventListener('click', () => {
        viewingTrash = !viewingTrash;
        viewTrashButton.textContent = viewingTrash ? 'View Active Files' : 'View Trash';
        fetchFiles(sortSelect.value); // Keep the current sort and search query applied
    });

    // Handle sort changes
    sortSelect.addEventListener('change', (event) => {
        fetchFiles(event.target.value);
    });

    // Handle sort order toggle
    sortOrderButton.addEventListener('click', () => {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        sortOrderButton.textContent = sortOrder === 'asc' ? 'Ascending' : 'Descending';
        fetchFiles(sortSelect.value);
    });

    // Search event listener
    searchButton.addEventListener('click', () => {
        currentSearchQuery = searchInput.value.trim(); // Update the current search query
        fetchFiles(sortSelect.value);
    });

    // Enter key event listener
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            currentSearchQuery = searchInput.value.trim(); // Update the current search query
            fetchFiles(sortSelect.value);
        }
    });

    // Clear search event listener
    clearSearchButton.addEventListener('click', () => {
        currentSearchQuery = ''; // Clear the current search query
        searchInput.value = ''; // Clear the search input
        fetchFiles(sortSelect.value);
    });

    document.getElementById('uploadButton').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
    
        input.addEventListener('change', async (event) => {
            const files = event.target.files;
            const formData = new FormData();
    
            Array.from(files).forEach((file) => {
                formData.append('files', file);
            });
    
            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData,
                });
    
                if (response.ok) {
                    alert('Files uploaded successfully');
                    fetchFiles();
                } else {
                    alert('Failed to upload files');
                }
            } catch (error) {
                console.error('Error uploading files:', error);
                alert('An error occurred while uploading files.');
            }
        });
    
        input.click();
    });

    // Initialize
    checkAuthStatus();
});

