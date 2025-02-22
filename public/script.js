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
    let globalTagList = []; // Maintain the global tag list
    let developerMode = false; // Global flag for developer mode
    let debounceTimer; // Add debounce timer for input handling

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
     * Toggle Developer Mode on and off.
     */
    function toggleDeveloperMode() {
        developerMode = !developerMode;
        const devButtons = document.querySelectorAll('.debug-button');

        devButtons.forEach((button) => {
            button.style.display = developerMode ? 'block' : 'none'; // Show/hide debug buttons
        });

        const devModeButton = document.getElementById('developerModeButton');
        devModeButton.textContent = developerMode ? 'Developer Mode: ON' : 'Developer Mode: OFF';
    }

    // Add event listener for the Developer Mode button
    document.getElementById('developerModeButton').addEventListener('click', toggleDeveloperMode);
    function createDebugButton(file) {
        const debugButton = document.createElement('button');
        debugButton.className = 'file-action debug-button';
        debugButton.style.backgroundColor = '#ffc107'; // Yellow color for debug
        debugButton.textContent = 'Debug Info';
        debugButton.style.display = developerMode ? 'block' : 'none'; // Hide by default if Developer Mode is off
        debugButton.addEventListener('click', () => {
            console.log('Debug Info:', {
                id: file.id,
                name: file.name,
                tags: file.tags,
                backendSyncStatus: file.backendSyncStatus || 'unknown',
            });
        });
        return debugButton;
    }
    /*
    * Refresh debug button visibility for existing file items.
    */
    function refreshDebugButtons() {
        const debugButtons = document.querySelectorAll('.debug-button');
        debugButtons.forEach((button) => {
            button.style.display = developerMode ? 'block' : 'none';
        });
    }

    // Call `refreshDebugButtons` after file list changes
    function populateFileList(files) {
        fileList.innerHTML = '';
        files.forEach((file) => {
            const fileItem = createFileItem(file);
            fileList.appendChild(fileItem);
        });
        refreshDebugButtons(); // Update debug button visibility
    }
    
    /*
     * Fetch files from the server and sort them.
     * @param {string} sortBy - The field to sort by (default: 'createdTime').
     */
    async function fetchFiles(sortBy = 'createdTime') {
        try {
            const response = await fetch(getFetchEndpoint());
    
            if (!response.ok) {
                throw new Error(`Fetch failed with status ${response.status}`);
            }
    
            let files = await response.json();
    
            // Sort files and update the file list
            files = sortFiles(files, sortBy);
            populateFileList(files);

            // Update the global tag list
            globalTagList = [...new Set(files.flatMap((file) => file.tags || []))].sort();
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

        // Add tag button and input
        const tagSection = createTagSection(file);

        fileItem.appendChild(thumbnail);
        fileItem.appendChild(fileName);
        fileItem.appendChild(actions);
        fileItem.appendChild(tagSection); // Include the new tag section
        return fileItem;
    }

    /**
     * Create the tag section with the "Add Tag" button and input field.
     * @param {Object} file - File object.
     * @returns {HTMLElement} - The tag section element.
     */
    function createTagSection(file) {
        const tagSection = document.createElement('div');
        tagSection.className = 'tag-section';
        tagSection.dataset.file = JSON.stringify(file); // Store file info

        // Tag container
        const tagContainer = document.createElement('div');
        tagContainer.className = 'tag-container';
        file.tags.forEach((tag) => tagContainer.appendChild(createTagElement(tag, file)));
        tagSection.appendChild(tagContainer);

        // Add Tag button
        const addTagButton = document.createElement('button');
        addTagButton.className = 'add-tag-button';
        addTagButton.textContent = 'Add Tag';
        addTagButton.addEventListener('click', () => toggleTagInput(tagSection));
        tagSection.appendChild(addTagButton);

        // Tag Input
        const tagInput = document.createElement('input');
        tagInput.type = 'text';
        tagInput.className = 'tag-input';
        tagInput.placeholder = 'Type a tag...';
        
        tagInput.addEventListener('input', () => updateTagSuggestions(tagInput, tagSection));
        tagInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const tag = tagInput.value.trim();
                addTagToFile(tag, JSON.parse(tagSection.dataset.file), tagContainer);
                tagInput.value = '';
            }
        });
        tagSection.appendChild(tagInput);

        const suggestionsDropdown = document.createElement('div');
        suggestionsDropdown.className = 'tag-suggestions';
        tagSection.appendChild(suggestionsDropdown);

        return tagSection;
    }

    /**
     * Update tag suggestions based on user input.
     * @param {HTMLElement} tagInput - The tag input field.
     * @param {HTMLElement} tagSection - The tag section container.
     */
    function updateTagSuggestions(tagInput, tagSection) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = tagInput.value.toLowerCase().trim();
            const dropdown = tagSection.querySelector('.tag-suggestions');
            const tagContainer = tagSection.querySelector('.tag-container');
            const file = JSON.parse(tagSection.dataset.file); // Parse file data
    
            // Clear previous suggestions
            dropdown.innerHTML = '';
    
            // If input is empty, close dropdown
            if (!query) {
                dropdown.style.display = 'none';
                return;
            }
    
            // Filter matching tags
            const suggestions = globalTagList.filter((tag) => tag.toLowerCase().includes(query));
    
            // Add "Add Tag" option if no exact match exists
            const addNewTagOption = !globalTagList.includes(query)
                ? [`Add Tag "${tagInput.value}"`]
                : [];
    
            // Combine suggestions with the "Add Tag" option
            const options = [...suggestions, ...addNewTagOption];
    
            // Populate the dropdown with options
            options.forEach((optionText) => {
                const suggestion = document.createElement('div');
                suggestion.className = 'tag-suggestion';
                suggestion.textContent = optionText;
    
                // Handle click event for adding a tag
                suggestion.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    const tag = optionText.startsWith('Add Tag')
                        ? tagInput.value.trim() // Add new tag
                        : optionText; // Use existing tag
                    addTagToFile(tag, file, tagContainer); // Add the tag
                    tagInput.value = ''; // Clear input
                    dropdown.style.display = 'none'; // Hide dropdown
                });
    
                dropdown.appendChild(suggestion);
            });
    
            dropdown.style.display = 'block'; // Show dropdown
        }, 300); // Adjust debounce delay as needed
    }

    /**
     * Add a tag to a file.
     * @param {string} tag - The tag to add.
     * @param {Object} file - The file object.
     * @param {HTMLElement} tagContainer - The tag container element.
     */
    async function addTagToFile(tag, file, tagContainer) {
        if (!tag.trim()) return;
    
        const fileData = typeof file === 'string' ? JSON.parse(file) : file;
    
        if (!fileData.tags.includes(tag)) {
            try {
                const response = await fetch('/update-tags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileId: fileData.id, action: 'add', tag }),
                });
    
                if (response.ok) {
                    const responseData = await response.json();
    
                    // Update file tags and backend sync status
                    fileData.tags = responseData.tags;
                    fileData.backendSyncStatus = responseData.backendSyncStatus;
    
                    // Rebuild tag container
                    tagContainer.innerHTML = '';
                    fileData.tags.forEach((t) => {
                        tagContainer.appendChild(createTagElement(t, fileData));
                    });
                } else {
                    console.error('Failed to add tag:', await response.text());
                }
            } catch (error) {
                console.error('Error adding tag:', error.message);
            }
        }
    }

    /**
     * Create a tag element with a remove button.
     * @param {string} tag - The tag name.
     * @param {Object} file - The file object.
     * @returns {HTMLElement} - The tag element.
     */
    function createTagElement(tag, file) {
        if (!tag.trim()) return null; // Skip empty tags
        
        const tagElement = document.createElement('div');
        tagElement.className = 'tag';

        const tagName = document.createElement('span');
        tagName.textContent = tag;

        const removeButton = document.createElement('span');
        removeButton.className = 'tag-remove';
        removeButton.textContent = '×';
        removeButton.addEventListener('click', () => removeTagFromFile(tag, file, tagElement,));

        tagElement.appendChild(tagName);
        tagElement.appendChild(removeButton);
        return tagElement;
    }

    /**
     * Remove a tag from a file.
     * @param {string} tag - The tag to remove.
     * @param {Object} file - The file object.
     * @param {HTMLElement} tagElement - The tag element to remove.
     */
    async function removeTagFromFile(tag, file, tagElement, refreshFiles = false) {
        if (!tag.trim()) return; // Prevent empty tags from being processed
    
        const confirmation = confirm(`Remove tag "${tag}"?`);
        if (!confirmation) return;
    
        const fileData = typeof file === 'string' ? JSON.parse(file) : file;
    
        try {
            const response = await fetch('/update-tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: file.id, action: 'remove', tag }),
            });
    
            const responseData = await response.json();
            console.log('Tags returned by backend:', responseData.tags);
    
            if (response.ok) {
                // Update local file tags and backend sync status
                fileData.tags = responseData.tags;
                fileData.backendSyncStatus = responseData.backendSyncStatus;
    
                // Rebuild the tag container
                const tagContainer = tagElement.parentElement;
                if (!fileData.tags.length === 0) {
                    tagContainer.innerHTML = '';
                } else {
                    tagContainer.innerHTML = '';
                    fileData.tags.forEach((t) => {
                        tagContainer.appendChild(createTagElement(t, fileData));
                    });
                }
    
                // Optionally refresh all files
                if (refreshFiles) {
                    console.log('Refreshing files to ensure consistency...');
                    await fetchFiles();
                }
            } else {
                console.error('Failed to remove tag:', await response.text());
            }
        } catch (error) {
            console.error('Error removing tag:', error.message);
            alert(`Failed to remove tag: ${error.message}`);
        }
    }
    
    /**
     * Toggle the visibility of the tag input field.
     * @param {HTMLElement} tagSection - The tag section container.
     */
    function toggleTagInput(tagSection) {
        const tagInput = tagSection.querySelector('.tag-input');
        tagInput.style.display = tagInput.style.display === 'block' ? 'none' : 'block';
        tagInput.focus();
    }

    /**
     * Adjust dropdown position to ensure it doesn't overflow the screen.
     * @param {HTMLElement} tagInput - The input element.
     * @param {HTMLElement} dropdown - The dropdown element.
     */
    function adjustDropdownPosition(tagInput, dropdown) {
        const inputRect = tagInput.getBoundingClientRect();
        const viewportWidth = window.innerWidth;

        // Position dropdown below the input
        dropdown.style.top = `${inputRect.bottom}px`;
        dropdown.style.left = `${inputRect.left}px`;
        dropdown.style.width = `${inputRect.width}px`; // Match input width

        // If dropdown overflows the screen, adjust its position
        const dropdownRect = dropdown.getBoundingClientRect();
        if (dropdownRect.right > viewportWidth) {
            dropdown.style.left = `${viewportWidth - dropdownRect.width - 10}px`; // Keep a small margin
        }
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

        // Add Debug Button
        const debugButton = createDebugButton(file);
        actions.appendChild(debugButton);

        return actions;
    }

    /**
     * Create a "Debug Info" button for a file.
     * @param {Object} file - The file object.
     * @returns {HTMLElement} - The debug button element.
     */
    function createDebugButton(file) {
        const debugButton = document.createElement('button');
        debugButton.className = 'file-action debug-button';
        debugButton.style.backgroundColor = '#ffc107'; // Yellow for debug
        debugButton.textContent = 'Debug Info';
        debugButton.style.display = developerMode ? 'block' : 'none'; // Hide unless developer mode is on
        debugButton.addEventListener('click', () => {
            console.log('Debug Info:', {
                id: file.id,
                name: file.name,
                tags: file.tags || [],
                backendSyncStatus: file.backendSyncStatus || 'unknown',
            });
        });
        return debugButton;
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

document.addEventListener('click', (event) => {
    const dropdowns = document.querySelectorAll('.tag-suggestions');
    dropdowns.forEach((dropdown) => {
        if (!dropdown.contains(event.target)) {
            dropdown.style.display = 'none'; // Hide dropdown if clicked outside
        }
    });
});
