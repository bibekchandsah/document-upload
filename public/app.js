const API_BASE = 'http://localhost:3000/api';

const folderList = document.getElementById('folderList');
const fileGrid = document.getElementById('fileGrid');
const breadcrumbsContainer = document.getElementById('breadcrumbs');
const createFolderBtn = document.getElementById('createFolderBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const viewerModal = document.getElementById('viewerModal');
const viewerBody = document.getElementById('viewerBody');
const viewerFileName = document.getElementById('viewerFileName');
const closeViewerBtn = document.getElementById('closeViewerBtn');
const downloadLink = document.getElementById('downloadLink');
const printBtn = document.getElementById('printBtn');
const searchInput = document.getElementById('searchInput');

let currentFolder = ''; // Empty string represents root
let currentFiles = [];
let searchTimeout;

// --- Initialization ---
async function init() {
    await loadSidebarFolders();

    // Check URL for folder and file parameters
    const urlParams = new URLSearchParams(window.location.search);
    const folderParam = urlParams.get('folder') || '';
    const fileParam = urlParams.get('file');

    await selectFolder(folderParam, false);

    if (fileParam) {
        // We need to find the file in the loaded currentFiles
        const file = currentFiles.find(f => f.name === fileParam && !f.isDirectory);
        if (file) {
            openViewer(file, false);
        }
    }

    // Handle browser back/forward buttons
    window.onpopstate = async () => {
        const params = new URLSearchParams(window.location.search);
        const folder = params.get('folder') || '';
        const file = params.get('file');

        if (folder !== currentFolder) {
            await selectFolder(folder, false);
        }

        if (file) {
            const fileObj = currentFiles.find(f => f.name === file && !f.isDirectory);
            if (fileObj) {
                openViewer(fileObj, false);
            }
        } else {
            closeViewer(false);
        }
    };
}

// --- Sidebar Operations ---
async function loadSidebarFolders() {
    try {
        // Fetch top-level folders for sidebar
        const res = await fetch(`${API_BASE}/files?folder=`);
        const items = await res.json();
        const folders = items.filter(item => item.isDirectory).map(item => item.name);
        renderSidebarFolders(folders);
    } catch (err) {
        console.error('Failed to load sidebar folders', err);
    }
}

function renderSidebarFolders(folders) {
    folderList.innerHTML = '';
    const homeLi = document.createElement('li');
    homeLi.className = 'folder-item';
    if (currentFolder === '') homeLi.classList.add('active');
    homeLi.innerHTML = `<i class="fas fa-home"></i> <span>Home</span>`;
    homeLi.onclick = () => selectFolder('');
    folderList.appendChild(homeLi);

    folders.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'folder-item';
        // Only mark active if it matches the *start* of the current path
        if (currentFolder === folder || currentFolder.startsWith(folder + '/')) li.classList.add('active');
        li.innerHTML = `<i class="fas fa-folder"></i> <span>${folder}</span>`;
        li.onclick = () => selectFolder(folder);
        folderList.appendChild(li);
    });
}

// --- Main Folder Operations ---
async function selectFolder(folderPath, updateUrl = true) {
    currentFolder = folderPath || '';

    renderBreadcrumbs(currentFolder);

    // Update sidebar active state
    document.querySelectorAll('.folder-item').forEach(el => {
        el.classList.remove('active');
        const span = el.querySelector('span');
        if (span) {
            const name = span.innerText;
            if (name === 'Home' && currentFolder === '') {
                el.classList.add('active');
            } else if (name !== 'Home' && (currentFolder === name || currentFolder.startsWith(name + '/'))) {
                el.classList.add('active');
            }
        }
    });

    if (updateUrl) {
        const newUrl = `${window.location.pathname}?folder=${encodeURIComponent(currentFolder)}`;
        history.pushState({ folder: currentFolder }, '', newUrl);
    }

    await loadFiles(currentFolder);
}

function renderBreadcrumbs(path) {
    breadcrumbsContainer.innerHTML = '';

    const homeLink = document.createElement('span');
    homeLink.className = 'breadcrumb-item';
    homeLink.innerHTML = '<i class="fas fa-home"></i>';
    homeLink.onclick = () => selectFolder('');
    breadcrumbsContainer.appendChild(homeLink);

    if (!path) return;

    const parts = path.split('/');
    let currentPath = '';

    parts.forEach((part, index) => {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.innerHTML = '<i class="fas fa-chevron-right"></i>';
        breadcrumbsContainer.appendChild(separator);

        currentPath += (index > 0 ? '/' : '') + part;
        const partPath = currentPath; // Capture for closure

        const link = document.createElement('span');
        link.className = 'breadcrumb-item';
        link.textContent = part;
        link.onclick = () => selectFolder(partPath);
        breadcrumbsContainer.appendChild(link);
    });
}

createFolderBtn.onclick = async () => {
    const name = prompt('Enter folder name:');
    if (name) {
        await createFolder(name);
    }
};

async function createFolder(name) {
    try {
        const res = await fetch(`${API_BASE}/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                parentFolder: currentFolder
            })
        });
        if (res.ok) {
            await loadFiles(currentFolder);
            // If we are at root, also update sidebar
            if (currentFolder === '') {
                await loadSidebarFolders();
            }
            return true;
        } else if (res.status === 400) {
            alert('Folder already exists');
            return false;
        } else {
            alert('Failed to create folder');
            return false;
        }
    } catch (err) {
        console.error(err);
        return false;
    }
}

// --- File Operations ---
async function loadFiles(folder) {
    try {
        const res = await fetch(`${API_BASE}/files?folder=${encodeURIComponent(folder)}`);
        const items = await res.json();
        currentFiles = items;
        renderFiles(items);
    } catch (err) {
        console.error('Failed to load files', err);
        fileGrid.innerHTML = `<div class="empty-state"><p style="color:red">Failed to load content</p></div>`;
    }
}

function renderFiles(items) {
    fileGrid.innerHTML = '';
    if (items.length === 0) {
        fileGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>This folder is empty</p>
            </div>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'file-card';

        if (item.isDirectory) {
            card.innerHTML = `
                <i class="file-icon fas fa-folder" style="color: #fbbf24;"></i>
                <div class="file-name" title="${item.name}">${item.name}</div>
                <div class="file-meta">Folder</div>
            `;
            // Navigate into folder
            const newPath = currentFolder ? `${currentFolder}/${item.name}` : item.name;
            card.onclick = () => selectFolder(newPath);
        } else {
            // For search results, item.path might be different from currentFolder
            // If item.path is present (from search), use it. Otherwise use currentFolder.
            const itemFolder = item.path !== undefined ? item.path : currentFolder;

            let metaHtml = formatSize(item.size);
            if (item.path !== undefined) {
                // It's a search result, show path
                metaHtml += `<br><span style="font-size:0.7rem; color:#888;">${item.path || 'Home'}</span>`;
            }

            card.innerHTML = `
                <i class="file-icon ${getFileIconClass(item.type)}"></i>
                <div class="file-name" title="${item.name}">${item.name}</div>
                <div class="file-meta">${metaHtml}</div>
            `;

            // We need to pass the correct folder to openViewer if it's a search result
            card.onclick = () => {
                // Temporarily override currentFolder for the viewer if needed, 
                // OR update openViewer to accept a path.
                // openViewer constructs path from currentFolder. 
                // Let's modify openViewer to accept an optional folder override.
                openViewer(item, true, itemFolder);
            };
        }

        fileGrid.appendChild(card);
    });
}

// --- Search ---
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(performSearch, 300);
});

async function performSearch() {
    const query = searchInput.value.trim();

    if (!query) {
        // If search is cleared, reload current folder
        loadFiles(currentFolder);
        return;
    }

    try {
        fileGrid.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Searching...</p></div>';
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        const results = await res.json();

        // Render results
        // We reuse renderFiles, but we need to make sure it handles the 'path' property
        renderFiles(results);

        if (results.length === 0) {
            fileGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>No matches found</p>
                </div>`;
        }
    } catch (err) {
        console.error(err);
        fileGrid.innerHTML = `<div class="empty-state"><p style="color:red">Search failed</p></div>`;
    }
}

function getFileIconClass(mimeType) {
    if (!mimeType) return 'fas fa-file';
    if (mimeType.includes('pdf')) return 'fas fa-file-pdf pdf';
    if (mimeType.includes('image')) return 'fas fa-file-image image';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'fas fa-file-powerpoint powerpoint';
    if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'fas fa-file-excel excel';
    if (mimeType.includes('word') || mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return 'fas fa-file-word word';
    if (mimeType.includes('text') || mimeType.includes('json')) return 'fas fa-file-alt';
    if (mimeType.includes('video')) return 'fas fa-file-video image';
    return 'fas fa-file';
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// --- Upload ---
uploadBtn.onclick = () => {
    fileInput.click();
};

fileInput.onchange = (e) => {
    if (!e.target.files.length) return;
    handleUpload(e.target.files);
};

// Drag and Drop
fileGrid.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileGrid.classList.add('drag-over');
});

fileGrid.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileGrid.classList.remove('drag-over');
});

fileGrid.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileGrid.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    // If no folder selected (root), we can still upload to root, 
    // or prompt if user wants to create a folder. 
    // The previous logic forced a folder creation. 
    // With nested folders, uploading to root is valid.
    // But let's keep the prompt if they are at root AND want to organize.
    // Actually, standard behavior is to upload to current view.
    // If current view is root, upload to root.

    // However, the user specifically asked for the prompt behavior before.
    // Let's modify it: If at root, maybe prompt? Or just upload?
    // "if user hasn't selected folder then ask user to create folder" was the request.
    // "Root" is technically "no folder selected" in the old model.
    // In the new model, "Root" is a valid location.
    // Let's assume if currentFolder is empty (Root), we prompt.

    if (currentFolder === '') {
        if (confirm('You are in the Root directory. Do you want to create a new folder to upload these files? (Cancel to upload to Root)')) {
            const name = prompt('Enter folder name:');
            if (name) {
                const created = await createFolder(name);
                if (created) {
                    // The createFolder switches to the new folder, so handleUpload will use it
                    handleUpload(files);
                }
            }
            return;
        }
    }

    handleUpload(files);
});

async function handleUpload(files) {
    // 1. Extract filenames
    const filenames = Array.from(files).map(f => f.name);

    try {
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
        uploadBtn.disabled = true;

        // 2. Check for duplicates
        const checkRes = await fetch(`${API_BASE}/check-duplicates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: currentFolder, filenames })
        });

        if (!checkRes.ok) throw new Error('Failed to check duplicates');

        const { duplicates } = await checkRes.json();
        const filesToUpload = [];

        for (let file of files) {
            if (duplicates.includes(file.name)) {
                const newName = prompt(`File "${file.name}" already exists in this folder.\nEnter a new name to rename it, \nor OK to overwrite existing file \nor Cancel to skip this file:`, file.name);
                if (newName) {
                    // User renamed the file
                    filesToUpload.push({ file, name: newName });
                }
                // If cancelled, we skip this file
            } else {
                filesToUpload.push({ file, name: file.name });
            }
        }

        if (filesToUpload.length === 0) {
            uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload';
            uploadBtn.disabled = false;
            fileInput.value = '';
            return; // Nothing to upload
        }

        // 3. Proceed with upload
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

        const formData = new FormData();
        formData.append('folder', currentFolder);
        for (let item of filesToUpload) {
            // Append with the (potentially new) name
            formData.append('files', item.file, item.name);
        }

        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            await loadFiles(currentFolder);
        } else {
            alert('Upload failed');
        }
    } catch (err) {
        console.error(err);
        alert('Error uploading files');
    } finally {
        uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload';
        uploadBtn.disabled = false;
        fileInput.value = '';
    }
}

// --- Viewer ---
function openViewer(file, updateUrl = true, folderOverride = null) {
    viewerFileName.textContent = file.name;
    viewerModal.classList.remove('hidden');

    const folderToUse = folderOverride !== null ? folderOverride : currentFolder;

    if (updateUrl) {
        const newUrl = `${window.location.pathname}?folder=${encodeURIComponent(folderToUse)}&file=${encodeURIComponent(file.name)}`;
        history.pushState({ folder: folderToUse, file: file.name }, '', newUrl);
    }

    // Construct path for API
    const filePath = folderToUse ? `${folderToUse}/${file.name}` : file.name;
    currentViewedFilePath = filePath; // Store for sharing
    const fileUrl = `${API_BASE}/view?path=${encodeURIComponent(filePath)}`;
    const downloadUrl = `${API_BASE}/download?path=${encodeURIComponent(filePath)}`;

    // Construct absolute URL for Google Viewer
    const absoluteUrl = new URL(fileUrl, window.location.origin).href;

    downloadLink.href = downloadUrl;

    viewerBody.innerHTML = '';

    const isDoc = file.name.match(/\.(docx|doc|xlsx|xls|pptx|ppt)$/i);
    const isText = file.name.match(/\.(txt|csv|json|md|js|css|html)$/i);
    const isVideo = file.type.includes('video') || file.name.match(/\.(mp4|webm|ogg)$/i);

    if (file.type.includes('image')) {
        const img = document.createElement('img');
        img.src = fileUrl;
        viewerBody.appendChild(img);
    } else if (file.type === 'application/pdf') {
        // Use Native Browser PDF Viewer (Works on localhost)
        const iframe = document.createElement('iframe');
        iframe.src = fileUrl;
        viewerBody.appendChild(iframe);
    } else if (isVideo) {
        // Video Player
        const video = document.createElement('video');
        video.src = fileUrl;
        video.controls = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '100%';
        viewerBody.appendChild(video);
    } else if (isText) {
        // Text/Code Viewer
        fetch(fileUrl)
            .then(res => res.text())
            .then(text => {
                const pre = document.createElement('pre');
                pre.style.padding = '1rem';
                pre.style.backgroundColor = '#f8f9fa';
                pre.style.overflow = 'auto';
                pre.style.height = '100%';
                pre.style.width = '100%';
                pre.style.whiteSpace = 'pre-wrap';
                pre.textContent = text;
                viewerBody.appendChild(pre);
            })
            .catch(err => {
                viewerBody.innerHTML = `<p style="color:red">Failed to load text content</p>`;
            });
    } else if (isDoc) {
        // Use Google Viewer for Office Docs (Requires public URL)
        const iframe = document.createElement('iframe');
        const encodedUrl = encodeURIComponent(absoluteUrl);
        iframe.src = `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;

        const fallbackDiv = document.createElement('div');
        fallbackDiv.style.position = 'absolute';
        fallbackDiv.style.bottom = '10px';
        fallbackDiv.style.textAlign = 'center';
        fallbackDiv.style.width = '100%';
        fallbackDiv.style.color = '#666';
        fallbackDiv.style.fontSize = '0.8rem';
        fallbackDiv.innerHTML = 'If preview fails (e.g. on localhost), use Download.';

        viewerBody.appendChild(iframe);
        viewerBody.appendChild(fallbackDiv);
    } else {
        viewerBody.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file-download"></i>
                <p>Preview not available</p>
                <a href="${downloadLink.href}" class="primary-btn" style="margin-top: 1rem;">Download to View</a>
            </div>`;
    }
}

function closeViewer(updateUrl = true) {
    viewerModal.classList.add('hidden');
    viewerBody.innerHTML = '';

    if (updateUrl && currentFolder) {
        const newUrl = `${window.location.pathname}?folder=${encodeURIComponent(currentFolder)}`;
        history.pushState({ folder: currentFolder }, '', newUrl);
    }
}

closeViewerBtn.onclick = () => closeViewer(true);

// Close modal on outside click
viewerModal.onclick = (e) => {
    if (e.target === viewerModal) {
        closeViewer(true);
    }
};

printBtn.onclick = () => {
    const iframe = viewerBody.querySelector('iframe');
    const img = viewerBody.querySelector('img');
    const video = viewerBody.querySelector('video');
    const textContent = viewerBody.querySelector('pre');

    if (iframe) {
        // Check if it's Google Viewer (cross-origin)
        if (iframe.src.includes('docs.google.com')) {
            alert('Printing is not supported for this preview. Please download the file to print.');
            return;
        }

        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error(e);
            alert('Unable to print directly. Please download the file.');
        }
    } else if (img) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
        <html>
            <head>
                <title>Print Image</title>
                <style>
                    @page { margin: 0; }
                    body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
                    img { max-width: 100%; max-height: 100%; object-fit: contain; }
                </style>
            </head>
            <body>
                <img src="${img.src}">
                <script>
                    window.onload = () => {
                        setTimeout(() => {
                            window.print();
                            window.close();
                        }, 500);
                    }
                </script>
            </body>
        </html>
        `);
        printWindow.document.close();
    } else if (video) {
        alert('Video files cannot be printed.');
    } else if (textContent) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Print Text</title>
                    <style>
                        @page { margin: 0; }
                        body { margin: 0; font-family: monospace; white-space: pre-wrap; }
                    </style>
                </head>
                <body>
                    ${textContent.innerHTML}
                    <script>
                        window.onload = () => {
                            setTimeout(() => {
                                window.print();
                                window.close();
                            }, 500);
                        }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    } else {
        alert('No document to print.');
    }
};

const shareBtn = document.getElementById('shareBtn');

shareBtn.onclick = async () => {
    // Get current file name from viewer
    const fileName = viewerFileName.textContent;
    // We need to reconstruct the full path. 
    // Since openViewer sets currentFolder/file in history, we can rely on that or the global currentFolder.
    // However, if we are viewing a search result, currentFolder might not be the file's parent.
    // Let's store the currently viewed file path in a variable when opening the viewer.
    if (!currentViewedFilePath) return;

    const duration = prompt('Enter expiration time in minutes (e.g., 10):', '60');
    if (!duration || isNaN(duration)) return;

    try {
        shareBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        const res = await fetch(`${API_BASE}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentViewedFilePath, duration: parseInt(duration) })
        });

        if (res.ok) {
            const data = await res.json();
            // Copy to clipboard
            navigator.clipboard.writeText(data.shareUrl).then(() => {
                alert(`Link copied to clipboard!\nExpires in ${duration} minutes.\n\n${data.shareUrl}`);
            }).catch(() => {
                prompt('Link generated! Copy it below:', data.shareUrl);
            });
        } else {
            alert('Failed to generate link');
        }
    } catch (err) {
        console.error(err);
        alert('Error generating link');
    } finally {
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
    }
};

let currentViewedFilePath = ''; // Helper to track what we are viewing

init();
