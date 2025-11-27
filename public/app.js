// Dynamically determine API base URL based on environment
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : `${window.location.origin}/api`;

// DOM Elements
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
const shareBtn = document.getElementById('shareBtn');
const shareModal = document.getElementById('shareModal');
const closeShareModal = document.getElementById('closeShareModal');
const expirationSelect = document.getElementById('expirationSelect');
const generateLinkBtn = document.getElementById('generateLinkBtn');
const shareForm = document.getElementById('shareForm');
const shareResult = document.getElementById('shareResult');
const shareLinkInput = document.getElementById('shareLinkInput');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const expiresAtSpan = document.getElementById('expiresAt');
const customTimeInput = document.getElementById('customTimeInput');
const customHours = document.getElementById('customHours');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');

// Sidebar toggle functionality
if (sidebarToggle && sidebar) {
    // Check if sidebar should start collapsed on mobile
    if (window.innerWidth <= 425) {
        sidebar.classList.add('collapsed');
    }

    sidebarToggle.addEventListener('click', (e) => {
        // Don't toggle if clicking on the create folder button
        if (e.target.closest('#createFolderBtn')) {
            return;
        }
        sidebar.classList.toggle('collapsed');
        // Save preference
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    });

    // Restore sidebar state from localStorage (only on desktop)
    if (window.innerWidth > 425) {
        const savedState = localStorage.getItem('sidebarCollapsed');
        if (savedState === 'true') {
            sidebar.classList.add('collapsed');
        }
    }
}

// Show/hide custom time input
expirationSelect.addEventListener('change', () => {
    if (expirationSelect.value === 'custom') {
        customTimeInput.style.display = 'block';
    } else {
        customTimeInput.style.display = 'none';
    }
});


// State
let currentFolder = ''; // Relative path within 'uploads/'
let currentFiles = [];
let searchTimeout;
let currentViewedFile = null; // Track the currently viewed file for sharing
let currentViewedFilePath = '';
let selectedFiles = new Set(); // Track selected files for bulk operations
let selectionMode = false; // Track if we're in selection mode

// Auth State
let ghToken = localStorage.getItem('gh_token');
let ghUser = localStorage.getItem('gh_user');
let ghRepo = localStorage.getItem('gh_repo');
let ghBranch = localStorage.getItem('gh_branch') || 'main';
let ghAvatar = localStorage.getItem('gh_avatar');

// Processing indicator helpers
function showProcessing(message = 'Processing...') {
    const indicator = document.getElementById('processingIndicator');
    const text = document.getElementById('processingText');
    if (indicator && text) {
        text.textContent = message;
        indicator.classList.add('active');
    }
}

function hideProcessing() {
    const indicator = document.getElementById('processingIndicator');
    if (indicator) {
        indicator.classList.remove('active');
    }
}

// --- Initialization ---
async function init() {
    if (!ghToken) {
        window.location.href = 'login.html';
        return;
    }

    // Verify token silently
    try {
        const res = await fetch(`${API_BASE}/github/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: ghToken })
        });
        if (res.ok) {
            const data = await res.json();
            ghUser = data.username;
            ghAvatar = data.avatar_url;
            localStorage.setItem('gh_user', ghUser);
            localStorage.setItem('gh_avatar', ghAvatar);

            // Display user profile in sidebar
            displayUserProfile();

            if (!ghRepo) {
                // Token valid but no repo selected, redirect to login to select repo
                window.location.href = 'login.html';
            } else {
                loadApp();
            }
        } else {
            // Token invalid
            logout();
        }
    } catch (e) {
        console.error(e);
        logout();
    }
}

function displayUserProfile() {
    console.log("loading user profile");
    // alert("loading user profile");
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');

    if (userAvatar && ghAvatar) {
        userAvatar.src = ghAvatar;
        userAvatar.style.display = 'block';
    } else if (userAvatar) {
        userAvatar.style.display = 'none';
    }

    if (userName && ghUser) {
        userName.textContent = ghUser;
    }
}

function logout() {
    localStorage.removeItem('gh_token');
    localStorage.removeItem('gh_user');
    localStorage.removeItem('gh_repo');
    localStorage.removeItem('gh_branch');
    localStorage.removeItem('gh_avatar');
    ghToken = null;
    ghUser = null;
    ghRepo = null;
    ghAvatar = null;
    // alert("logout");
    window.location.href = 'login.html';
}

async function loadApp() {
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
            if (fileObj) openViewer(fileObj, false);
        } else {
            closeViewer(false);
        }
    };
}



// --- Sidebar Operations ---
async function loadSidebarFolders() {
    // GitHub API doesn't support recursive folder listing easily without multiple calls or GraphQL.
    // For simplicity, we'll just list folders in the current root.
    // Or we can fetch the root and filter dirs.
    // Since we only show top-level folders in sidebar usually:
    try {
        const items = await fetchGitHubFiles('');
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
    
    // Add drag and drop for Home folder
    homeLi.ondragover = (e) => handleSidebarDragOver(e);
    homeLi.ondragleave = (e) => handleSidebarDragLeave(e);
    homeLi.ondrop = (e) => handleSidebarDrop(e, '');
    
    folderList.appendChild(homeLi);

    folders.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'folder-item';
        // Only mark active if it matches the *start* of the current path
        if (currentFolder === folder || currentFolder.startsWith(folder + '/')) li.classList.add('active');
        li.innerHTML = `<i class="fas fa-folder"></i> <span>${folder}</span>`;
        li.onclick = () => selectFolder(folder);
        
        // Add drag and drop handlers
        li.ondragover = (e) => handleSidebarDragOver(e);
        li.ondragleave = (e) => handleSidebarDragLeave(e);
        li.ondrop = (e) => handleSidebarDrop(e, folder);
        
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
    let name = prompt('Enter folder name:');
    if (!name || name.trim() === '') return;
    name = name.trim();

    // Check for duplicate folder names
    const existingFolderNames = currentFiles.filter(item => item.isDirectory === true).map(item => item.name);
    console.log('Existing folders:', existingFolderNames);
    console.log('Attempting to create folder:', name);
    
    while (existingFolderNames.includes(name)) {
        alert(`❌ Folder "${name}" already exists!\n\nPlease choose a different name.`);
        name = prompt('Enter a different folder name:');
        if (!name || name.trim() === '') return;
        name = name.trim();
    }

    await createFolder(name);
};

async function createFolder(name) {
    try {
        const res = await fetch(`${API_BASE}/github/create-folder`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ghToken}`
            },
            body: JSON.stringify({
                owner: ghUser,
                repo: ghRepo,
                branch: ghBranch,
                folder: currentFolder,
                name
            })
        });

        if (res.ok) {
            await loadFiles(currentFolder);
            if (currentFolder === '') await loadSidebarFolders();
            return true;
        }
        else if (res.status === 500) {
            alert('Folder already exists');
            return false;
        }
        else {
            alert('Failed to create folder');
            return false;
        }
    } catch (err) {
        console.error(err);
        return false;
    }
}

// --- File Operations ---
async function fetchGitHubFiles(path) {
    const res = await fetch(`${API_BASE}/github/files?owner=${ghUser}&repo=${ghRepo}&branch=${ghBranch}&path=${encodeURIComponent(path)}`, {
        headers: { 'Authorization': `Bearer ${ghToken}` }
    });
    if (!res.ok) throw new Error('Failed to fetch files');
    return await res.json();
}

async function loadFiles(folder) {
    try {
        fileGrid.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';
        const items = await fetchGitHubFiles(folder);
        currentFiles = items;
        renderFiles(items);
    } catch (err) {
        console.error('Failed to load files', err);
        fileGrid.innerHTML = `<div class="empty-state"><p style="color:red">Failed to load content. Check your connection or repo settings.</p></div>`;
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
        card.dataset.itemName = item.name;
        card.dataset.isDirectory = item.isDirectory;
        
        // Make card draggable
        card.draggable = true;
        card.ondragstart = (e) => handleDragStart(e, item);
        card.ondragend = (e) => handleDragEnd(e);
        
        // Allow drop on folders
        if (item.isDirectory) {
            card.ondragover = (e) => handleDragOver(e);
            card.ondragleave = (e) => handleDragLeave(e);
            card.ondrop = (e) => handleDrop(e, item);
        }

        // Add checkbox for selection
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-card-checkbox';
        checkbox.checked = selectedFiles.has(item.name);
        checkbox.onclick = (e) => {
            e.stopPropagation();
            console.log('Checkbox clicked for:', item.name);
            toggleFileSelection(item.name);
        };
        card.appendChild(checkbox);

        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'file-card-actions';
        actionsDiv.innerHTML = `
            <button class="file-action-btn" onclick="event.stopPropagation(); renameItem('${item.name}', ${item.isDirectory})" title="Rename">
                <i class="fas fa-edit"></i>
            </button>
            <button class="file-action-btn delete" onclick="event.stopPropagation(); deleteItem('${item.name}', ${item.isDirectory})" title="Delete">
                <i class="fas fa-trash"></i>
            </button>
        `;
        card.appendChild(actionsDiv);

        // Create content elements
        const fileIcon = document.createElement('i');
        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.title = item.name;
        fileName.textContent = item.name;
        
        const fileMeta = document.createElement('div');
        fileMeta.className = 'file-meta';

        if (item.isDirectory) {
            fileIcon.className = 'file-icon fas fa-folder';
            fileIcon.style.color = '#fbbf24';
            fileMeta.textContent = 'Folder';
            
            card.appendChild(fileIcon);
            card.appendChild(fileName);
            card.appendChild(fileMeta);
            
            // Navigate into folder
            const newPath = currentFolder ? `${currentFolder}/${item.name}` : item.name;
            card.onclick = (e) => {
                if (!e.target.closest('.file-card-checkbox') && !e.target.closest('.file-card-actions')) {
                    selectFolder(newPath);
                }
            };
        } else {
            fileIcon.className = 'file-icon ' + getFileIconClass(item.type);
            
            const itemFolder = item.path !== undefined ? item.path : currentFolder;
            let metaText = formatSize(item.size);
            if (item.path !== undefined && item.path !== currentFolder) {
                fileMeta.innerHTML = metaText + `<br><span style="font-size:0.7rem; color:#888;">${item.path || 'Home'}</span>`;
            } else {
                fileMeta.textContent = metaText;
            }
            
            card.appendChild(fileIcon);
            card.appendChild(fileName);
            card.appendChild(fileMeta);

            card.onclick = (e) => {
                if (!e.target.closest('.file-card-checkbox') && !e.target.closest('.file-card-actions')) {
                    openViewer(item, true, itemFolder);
                }
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

    // GitHub API doesn't support recursive file search easily via the content API.
    // We would need the Tree API for full recursive search, which is more complex.
    // For now, we'll just filter the CURRENT view or implement a basic client-side filter if we had all files.
    // BUT, the requirement was "Smart Search".
    // Implementing full recursive search on GitHub via API can be slow.
    // Alternative: Use the 'fs' based search if we were syncing. But we are cloud-only now.
    // Let's implement a simple client-side filter of the CURRENT folder for now, 
    // OR explain that global search is limited.
    // Actually, let's try to search in the current folder only for MVP.

    // Wait, the previous implementation was recursive.
    // To do recursive on GitHub, we need to fetch the Git Tree recursively.
    // GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1

    try {
        fileGrid.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Searching...</p></div>';

        // We'll use a new endpoint or just logic here?
        // Let's do it client side if the tree isn't huge, or add a backend route.
        // Backend route is better to keep secrets safe, but we are sending token anyway.
        // Let's stick to current folder filtering for MVP stability, 
        // or try the Tree API if we have time.
        // Given the complexity, let's filter current files first.

        const filtered = currentFiles.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
        renderFiles(filtered);

    } catch (err) {
        console.error(err);
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
uploadBtn.onclick = () => fileInput.click();

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
    handleUpload(files);
});

async function handleUpload(files) {
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    // GitHub file size limit is 100MB
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes
    const oversizedFiles = [];
    const validFiles = [];
    const duplicateFiles = [];
    let totalSize = 0;

    // Get existing file names in current folder
    const existingFileNames = currentFiles.filter(item => item.isDirectory === false).map(item => item.name);
    console.log('Existing files:', existingFileNames);
    console.log('Files to upload:', Array.from(files).map(f => f.name));

    // Check file sizes and duplicates
    for (let file of files) {
        if (file.size > MAX_FILE_SIZE) {
            oversizedFiles.push({ name: file.name, size: formatSize(file.size) });
        } else if (existingFileNames.includes(file.name)) {
            duplicateFiles.push(file.name);
        } else {
            validFiles.push(file);
            totalSize += file.size;
        }
    }

    // Show warning for oversized files
    if (oversizedFiles.length > 0) {
        const fileList = oversizedFiles.map(f => `• ${f.name} (${f.size})`).join('\n');
        const proceed = confirm(
            `⚠️ Warning: GitHub has a 100MB file size limit!\n\n` +
            `The following files exceed this limit and will be skipped:\n${fileList}\n\n` +
            `Continue uploading ${validFiles.length} valid file(s)?`
        );
        if (!proceed) {
            uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload';
            uploadBtn.disabled = false;
            return;
        }
    }

    // Show warning for duplicate files
    if (duplicateFiles.length > 0) {
        const fileList = duplicateFiles.map(f => `• ${f}`).join('\n');
        alert(
            `❌ Duplicate Files Detected!\n\n` +
            `The following files already exist in this folder:\n${fileList}\n\n` +
            `Please rename these files before uploading.`
        );
        uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload';
        uploadBtn.disabled = false;
        return;
    }

    if (validFiles.length === 0) {
        alert('No valid files to upload. All files exceed the 100MB limit.');
        uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload';
        uploadBtn.disabled = false;
        return;
    }

    // Show progress UI
    const progressContainer = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('uploadProgressText');
    const uploadDetails = document.getElementById('uploadDetails');
    const cancelBtn = document.getElementById('cancelUploadBtn');
    
    let uploadCancelled = false;
    
    progressContainer.style.display = 'block';
    uploadBtn.disabled = true;

    // Cancel upload handler
    const cancelUpload = () => {
        uploadCancelled = true;
        progressContainer.style.display = 'none';
        uploadBtn.disabled = false;
    };
    
    cancelBtn.onclick = cancelUpload;

    try {
        let uploadedCount = 0;
        const totalFiles = validFiles.length;

        for (let i = 0; i < validFiles.length; i++) {
            if (uploadCancelled) break;

            const file = validFiles[i];
            const formData = new FormData();
            formData.append('owner', ghUser);
            formData.append('repo', ghRepo);
            formData.append('branch', ghBranch);
            formData.append('folder', currentFolder);
            formData.append('files', file);

            // Update progress
            const progress = ((i + 1) / totalFiles) * 100;
            progressBar.style.width = progress + '%';
            progressText.textContent = `Uploading file ${i + 1} of ${totalFiles}...`;
            uploadDetails.textContent = `${file.name} (${formatSize(file.size)})`;

            const res = await fetch(`${API_BASE}/github/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${ghToken}` },
                body: formData
            });

            if (res.ok) {
                uploadedCount++;
            } else {
                console.error(`Failed to upload ${file.name}`);
            }
        }

        if (!uploadCancelled) {
            progressText.textContent = `✓ Upload complete! ${uploadedCount} of ${totalFiles} files uploaded`;
            progressBar.style.width = '100%';
            uploadDetails.textContent = '';
            
            // Hide progress after 2 seconds
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 2000);

            await loadFiles(currentFolder);
        }
    } catch (err) {
        console.error(err);
        alert('Error uploading files');
        progressContainer.style.display = 'none';
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
    currentViewedFile = { ...file, folder: folderOverride !== null ? folderOverride : currentFolder }; // Track for sharing

    const folderToUse = folderOverride !== null ? folderOverride : currentFolder;

    if (updateUrl) {
        const newUrl = `${window.location.pathname}?folder=${encodeURIComponent(folderToUse)}&file=${encodeURIComponent(file.name)}`;
        history.pushState({ folder: folderToUse, file: file.name }, '', newUrl);
    }

    // Construct path for API
    const filePath = folderToUse ? `${folderToUse}/${file.name}` : file.name;
    currentViewedFilePath = filePath; // Store for sharing

    // View URL via Proxy
    const fileUrl = `${API_BASE}/github/view?owner=${ghUser}&repo=${ghRepo}&branch=${ghBranch}&path=${encodeURIComponent(filePath)}`;

    // For download, we can use the same view URL but maybe force download?
    // Or just let the browser handle it.
    downloadLink.href = fileUrl;

    // Show loading state
    viewerBody.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading preview...</p></div>';

    const isDoc = file.name.match(/\.(docx|doc|xlsx|xls|pptx|ppt|csv)$/i);
    const isText = file.name.match(/\.(txt|json|md|js|css|html)$/i);
    const isVideo = file.type.includes('video') || file.name.match(/\.(mp4|webm|ogg|mp3)$/i);

    // Log the request details for debugging
    console.log('Fetching file:', {
        url: fileUrl,
        user: ghUser,
        repo: ghRepo,
        branch: ghBranch,
        path: filePath
    });

    fetch(fileUrl, { headers: { 'Authorization': `Bearer ${ghToken}` } })
        .then(res => {
            console.log('Response status:', res.status, res.statusText);
            if (!res.ok) {
                throw new Error(`Failed to load file: ${res.status} ${res.statusText}`);
            }
            return res.blob();
        })
        .then(blob => {
            console.log('Blob received:', blob.size, 'bytes, type:', blob.type);
            const objectUrl = URL.createObjectURL(blob);
            console.log('Object URL created:', objectUrl);

            if (file.type.includes('image')) {
                const img = document.createElement('img');
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.display = 'block';

                img.onload = () => {
                    console.log('Image loaded successfully!');
                    viewerBody.innerHTML = '';
                    viewerBody.appendChild(img);
                };

                img.onerror = (e) => {
                    console.error('Image failed to load:', e);
                    console.error('Image src:', img.src);
                    console.error('Blob type:', blob.type);
                    console.error('Blob size:', blob.size);
                    viewerBody.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                            <p style="color:red">Failed to display image</p>
                            <p style="font-size: 0.85rem; color: #666;">Blob size: ${blob.size} bytes</p>
                            <p style="font-size: 0.85rem; color: #666;">Try downloading the file instead</p>
                        </div>`;
                };

                // Set src LAST to ensure handlers are attached
                img.src = objectUrl;
            } else if (file.type === 'application/pdf') {
                // Check if mobile device
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
                
                if (isMobile) {
                    // Use Google Docs Viewer for mobile devices
                    viewerBody.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading PDF viewer...</p></div>';
                    
                    generateTempShareLink(file, folderToUse)
                        .then(shareUrl => {
                            const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(shareUrl)}&embedded=true`;
                            const iframe = document.createElement('iframe');
                            iframe.src = googleViewerUrl;
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            iframe.style.border = 'none';
                            viewerBody.innerHTML = '';
                            viewerBody.appendChild(iframe);
                        })
                        .catch(err => {
                            console.error('Failed to load PDF with Google Viewer:', err);
                            // Fallback to native PDF viewer
                            const iframe = document.createElement('iframe');
                            iframe.src = objectUrl;
                            viewerBody.innerHTML = '';
                            viewerBody.appendChild(iframe);
                        });
                } else {
                    // Desktop: use native PDF viewer
                    const iframe = document.createElement('iframe');
                    iframe.src = objectUrl;
                    viewerBody.innerHTML = '';
                    viewerBody.appendChild(iframe);
                }
            } else if (isVideo) {
                const video = document.createElement('video');
                video.src = objectUrl;
                video.controls = true;
                video.style.maxWidth = '100%';
                video.style.maxHeight = '100%';
                viewerBody.innerHTML = '';
                viewerBody.appendChild(video);
            } else if (isText) {
                blob.text().then(text => {
                    const pre = document.createElement('pre');
                    pre.style.padding = '1rem';
                    pre.style.backgroundColor = '#f8f9fa';
                    pre.style.overflow = 'auto';
                    pre.style.height = '100%';
                    pre.style.width = '100%';
                    pre.style.whiteSpace = 'pre-wrap';
                    pre.textContent = text;
                    viewerBody.innerHTML = '';
                    viewerBody.appendChild(pre);
                });
                // } else if (isDoc) {
                //     // Google Viewer needs a PUBLIC URL. It won't work with our proxy or blob.
                //     // We can't view Office docs unless the repo is public and we use the raw.githubusercontent link.
                //     // Fallback to download.
                //     viewerBody.innerHTML = `
                //         <div class="empty-state">
                //             <i class="fas fa-file-word"></i>
                //             <p>Preview not available for private files</p>
                //             <a href="${objectUrl}" download="${file.name}" class="primary-btn" style="margin-top: 1rem;">Download</a>
                //         </div>`;
                // } 
            } else if (isDoc) {
                // Check if running on localhost
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    // Google Docs Viewer cannot access localhost URLs
                    viewerBody.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-info-circle" style="color: #3b82f6; font-size: 2.5rem;"></i>
                            <h3 style="margin-top: 1rem; color: #1f2937; font-size: 1.1rem;">Document Preview (Localhost)</h3>
                            <p style="margin-top: 0.5rem; color: #6b7280; font-size: 0.9rem;">Google Docs Viewer requires a public URL.</p>
                            <p style="margin-top: 0.5rem; color: #6b7280; font-size: 0.8rem;">This will work automatically when deployed to Render.</p>
                            <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                                <a href="${objectUrl}" download="${file.name}" class="primary-btn" style="padding: 0.6rem 1rem; font-size: 0.9rem;">
                                    <i class="fas fa-download" style="font-size: 1rem; margin-bottom: 0px;"></i> Download
                                </a>
                                <button onclick="window.open('${objectUrl}', '_blank')" class="primary-btn" style="background: #10b981; padding: 0.6rem 1rem; font-size: 0.9rem;">
                                    <i class="fas fa-external-link-alt" style="font-size: 1rem; margin-bottom: 0px;"></i> Open
                                </button>
                            </div>
                        </div>`;
                } else {
                    // For Office documents on public server, generate temporary share link and use Google Docs Viewer
                    viewerBody.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading document viewer...</p></div>';
                    generateTempShareLink(file, folderToUse)
                        .then(shareUrl => {
                            console.log('Generated share URL:', shareUrl);
                            const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(shareUrl)}&embedded=true`;
                            console.log('Google Viewer URL:', googleViewerUrl);
                            
                            const iframe = document.createElement('iframe');
                            iframe.src = googleViewerUrl;
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            iframe.style.border = 'none';
                            
                            // Add error handler for iframe
                            iframe.onerror = () => {
                                console.error('Iframe failed to load');
                                viewerBody.innerHTML = `
                                    <div class="empty-state">
                                        <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                                        <p>Failed to load document viewer</p>
                                        <a href="${shareUrl}" target="_blank" class="primary-btn" style="margin-top: 1rem;">
                                            <i class="fas fa-external-link-alt"></i> Open in New Tab
                                        </a>
                                    </div>`;
                            };
                            
                            viewerBody.innerHTML = '';
                            viewerBody.appendChild(iframe);
                            
                            // Add timeout fallback
                            setTimeout(() => {
                                if (viewerBody.querySelector('iframe') && viewerBody.querySelector('iframe').src === googleViewerUrl) {
                                    // Check if iframe loaded successfully by checking if there's content
                                    // If Google Docs Viewer fails silently, offer alternative
                                    const fallbackDiv = document.createElement('div');
                                    fallbackDiv.style.position = 'absolute';
                                    fallbackDiv.style.bottom = '10px';
                                    fallbackDiv.style.right = '10px';
                                    fallbackDiv.innerHTML = `
                                        <a href="${shareUrl}" target="_blank" class="primary-btn" style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                                            <i class="fas fa-external-link-alt"></i> Having trouble? Open in new tab
                                        </a>`;
                                    viewerBody.style.position = 'relative';
                                    viewerBody.appendChild(fallbackDiv);
                                }
                            }, 3000);
                        })
                        .catch(err => {
                            console.error('Failed to generate share link:', err);
                            viewerBody.innerHTML = `
                                <div class="empty-state">
                                    <i class="fas fa-file-word"></i>
                                    <p>Failed to load document preview</p>
                                    <p style="font-size: 0.85rem; color: #666; margin-top: 0.5rem;">${err.message}</p>
                                    <a href="${objectUrl}" download="${file.name}" class="primary-btn" style="margin-top: 1rem;">Download</a>
                                </div>`;
                        });
                }
            }
            else {
                // For all other file types, try Google Docs Viewer on public server
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    // Localhost: offer download
                    viewerBody.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-file" style="color: #6b7280; font-size: 2.5rem;"></i>
                            <h3 style="margin-top: 1rem; color: #1f2937; font-size: 1.1rem;">File Preview (Localhost)</h3>
                            <p style="margin-top: 0.5rem; color: #6b7280; font-size: 0.9rem;">Preview requires a public URL.</p>
                            <p style="margin-top: 0.25rem; color: #6b7280; font-size: 0.8rem;">File type: ${file.name.split('.').pop().toUpperCase()}</p>
                            <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                                <a href="${objectUrl}" download="${file.name}" class="primary-btn" style="padding: 0.6rem 1rem; font-size: 0.9rem;">
                                    <i class="fas fa-download"></i> Download
                                </a>
                                <button onclick="window.open('${objectUrl}', '_blank')" class="primary-btn" style="background: #10b981; padding: 0.6rem 1rem; font-size: 0.9rem;">
                                    <i class="fas fa-external-link-alt"></i> Open
                                </button>
                            </div>
                        </div>`;
                } else {
                    // Public server: try Google Docs Viewer for all file types
                    viewerBody.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading document viewer...</p></div>';
                    
                    generateTempShareLink(file, folderToUse)
                        .then(shareUrl => {
                            console.log('Generated share URL for file:', shareUrl);
                            const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(shareUrl)}&embedded=true`;
                            
                            const iframe = document.createElement('iframe');
                            iframe.src = googleViewerUrl;
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            iframe.style.border = 'none';
                            
                            viewerBody.innerHTML = '';
                            viewerBody.appendChild(iframe);
                            
                            // Add fallback after timeout
                            setTimeout(() => {
                                const fallbackDiv = document.createElement('div');
                                fallbackDiv.style.position = 'absolute';
                                fallbackDiv.style.bottom = '10px';
                                fallbackDiv.style.right = '10px';
                                fallbackDiv.innerHTML = `
                                    <a href="${shareUrl}" target="_blank" class="primary-btn" style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                                        <i class="fas fa-external-link-alt"></i> Open in new tab
                                    </a>`;
                                viewerBody.style.position = 'relative';
                                viewerBody.appendChild(fallbackDiv);
                            }, 3000);
                        })
                        .catch(err => {
                            console.error('Failed to load with Google Viewer:', err);
                            viewerBody.innerHTML = `
                                <div class="empty-state">
                                    <i class="fas fa-file-download"></i>
                                    <p>Preview not available</p>
                                    <p style="font-size: 0.85rem; color: #666; margin-top: 0.5rem;">${err.message}</p>
                                    <a href="${objectUrl}" download="${file.name}" class="primary-btn" style="margin-top: 1rem;">Download</a>
                                </div>`;
                        });
                }
            }

            // Update download link to use the blob
            downloadLink.href = objectUrl;
            downloadLink.download = file.name;
        })
        .catch(err => {
            console.error('Error loading file:', err);
            viewerBody.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                    <p style="color: #ef4444; font-weight: 600;">Failed to load file</p>
                    <p style="font-size: 0.9rem; color: #888; margin-top: 0.5rem;">${err.message}</p>
                    <p style="font-size: 0.85rem; color: #666; margin-top: 1rem;">Check browser console for details</p>
                </div>`;
        });
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
viewerModal.onclick = (e) => {
    if (e.target === viewerModal) closeViewer(true);
};

// Share Button (Modified for GitHub)
// Share Button - Opens share modal
shareBtn.onclick = () => {
    if (!currentViewedFile) {
        alert('Please open a file first');
        return;
    }
    shareModal.classList.remove('hidden');
    // Reset modal state
    shareForm.style.display = 'block';
    shareResult.style.display = 'none';
};

// Close share modal
closeShareModal.onclick = () => {
    shareModal.classList.add('hidden');
};

// Close modal when clicking outside
shareModal.onclick = (e) => {
    if (e.target === shareModal) {
        shareModal.classList.add('hidden');
    }
};

// Generate share link
generateLinkBtn.onclick = async () => {
    if (!currentViewedFile) return;

    generateLinkBtn.disabled = true;
    generateLinkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
        // Get expiration hours
        let expirationHours;
        if (expirationSelect.value === 'custom') {
            const customValue = parseFloat(customHours.value);
            const unit = document.getElementById('customUnit').value;

            if (!customValue || customValue <= 0) {
                alert('Please enter a valid custom duration (must be greater than 0)');
                return;
            }

            if (unit === 'minutes') {
                expirationHours = customValue / 60;
            } else if (unit === 'days') {
                expirationHours = customValue * 24;
            } else {
                expirationHours = customValue;
            }
        } else {
            expirationHours = parseFloat(expirationSelect.value);
        }

        const filePath = currentViewedFile.folder
            ? `${currentViewedFile.folder}/${currentViewedFile.name}`
            : currentViewedFile.name;

        const res = await fetch(`${API_BASE}/share/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ghToken}`
            },
            body: JSON.stringify({
                owner: ghUser,
                repo: ghRepo,
                branch: ghBranch,
                path: filePath,
                expirationHours
            })
        });

        if (!res.ok) {
            throw new Error('Failed to create share link');
        }

        const data = await res.json();

        // Show result
        shareForm.style.display = 'none';
        shareResult.style.display = 'block';
        shareLinkInput.value = data.url;
        expiresAtSpan.textContent = new Date(data.expiresAt).toLocaleString();
    } catch (error) {
        console.error(error);
        alert('Failed to generate share link');
    } finally {
        generateLinkBtn.disabled = false;
        generateLinkBtn.innerHTML = '<i class="fas fa-link"></i> Generate Share Link';
    }
};

// Helper function to generate temporary share link for Google Docs Viewer
async function generateTempShareLink(file, folder) {
    const filePath = folder ? `${folder}/${file.name}` : file.name;
    
    const res = await fetch(`${API_BASE}/share/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ghToken}`
        },
        body: JSON.stringify({
            owner: ghUser,
            repo: ghRepo,
            branch: ghBranch,
            path: filePath,
            expirationHours: 0.25 // 15 minutes for preview
        })
    });
    
    if (!res.ok) {
        throw new Error('Failed to create share link');
    }
    
    const data = await res.json();
    // Return the download URL (without download=true parameter for inline viewing)
    return data.url + '/download';
}


// Copy link to clipboard
copyLinkBtn.onclick = () => {
    shareLinkInput.select();
    document.execCommand('copy');

    // Visual feedback
    const originalText = copyLinkBtn.innerHTML;
    copyLinkBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    copyLinkBtn.style.background = '#10b981';

    setTimeout(() => {
        copyLinkBtn.innerHTML = originalText;
        copyLinkBtn.style.background = '';
    }, 2000);
};

// QR Code generation
const qrCodeBtn = document.getElementById('qrCodeBtn');
const qrCodeContainer = document.getElementById('qrCodeContainer');
const qrCodeCanvas = document.getElementById('qrCodeCanvas');
let qrCodeInstance = null;

if (qrCodeBtn) {
    qrCodeBtn.onclick = () => {
        const shareUrl = shareLinkInput.value;
        if (!shareUrl) return;

        // Check if QRCode library is loaded
        if (typeof QRCode === 'undefined') {
            console.error('QRCode library not loaded');
            alert('QR Code feature is temporarily unavailable. Please try again in a moment.');
            return;
        }

        if (qrCodeContainer.style.display === 'none') {
            // Clear previous QR code
            qrCodeCanvas.innerHTML = '';
            
            // Generate and show QR code
            try {
                qrCodeInstance = new QRCode(qrCodeCanvas, {
                    text: shareUrl,
                    width: 200,
                    height: 200,
                    colorDark: '#1f2937',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
                
                // Center the QR code
                const qrImg = qrCodeCanvas.querySelector('img') || qrCodeCanvas.querySelector('canvas');
                if (qrImg) {
                    qrImg.style.display = 'block';
                    qrImg.style.margin = '0 auto';
                }
                
                qrCodeContainer.style.display = 'block';
                qrCodeBtn.innerHTML = '<i class="fas fa-times"></i>';
                qrCodeBtn.title = 'Hide QR Code';
            } catch (error) {
                console.error('QR Code generation error:', error);
                alert('Failed to generate QR code');
            }
        } else {
            // Hide QR code
            qrCodeContainer.style.display = 'none';
            qrCodeBtn.innerHTML = '<i class="fas fa-qrcode"></i>';
            qrCodeBtn.title = 'Show QR Code';
        }
    };
}

// Print Button
printBtn.onclick = () => {
    // Trigger browser's print dialog to print the currently viewed file
    window.print();
};

// ====================
// FILE MANAGEMENT OPERATIONS
// ====================

// Toggle file selection
function toggleFileSelection(itemName) {
    if (selectedFiles.has(itemName)) {
        selectedFiles.delete(itemName);
    } else {
        selectedFiles.add(itemName);
    }
    console.log('Selected files:', Array.from(selectedFiles));
    console.log('Selection count:', selectedFiles.size);
    updateBulkActionsBar();
    updateCheckboxes();
}

// Update bulk actions bar visibility
function updateBulkActionsBar() {
    const bulkActionsBar = document.getElementById('bulkActionsBar');
    const selectedCount = document.getElementById('selectedCount');
    
    console.log('updateBulkActionsBar called, selectedFiles.size:', selectedFiles.size);
    console.log('bulkActionsBar element:', bulkActionsBar);
    
    if (selectedFiles.size > 0) {
        selectionMode = true;
        bulkActionsBar.classList.add('active');
        selectedCount.textContent = selectedFiles.size;
        console.log('Showing bulk actions bar');
    } else {
        selectionMode = false;
        bulkActionsBar.classList.remove('active');
        console.log('Hiding bulk actions bar');
    }
}

// Update checkbox states
function updateCheckboxes() {
    document.querySelectorAll('.file-card').forEach(card => {
        const checkbox = card.querySelector('.file-card-checkbox');
        const itemName = card.dataset.itemName;
        if (checkbox) {
            checkbox.checked = selectedFiles.has(itemName);
            if (selectedFiles.has(itemName)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        }
    });
}

// Bulk action buttons
document.getElementById('selectAllBtn')?.addEventListener('click', () => {
    currentFiles.forEach(item => selectedFiles.add(item.name));
    updateBulkActionsBar();
    updateCheckboxes();
});

document.getElementById('deselectAllBtn')?.addEventListener('click', () => {
    selectedFiles.clear();
    updateBulkActionsBar();
    updateCheckboxes();
});

document.getElementById('bulkDeleteBtn')?.addEventListener('click', async () => {
    if (selectedFiles.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedFiles.size} item(s)? This action cannot be undone.`)) {
        return;
    }

    const items = Array.from(selectedFiles);
    let successCount = 0;
    
    showProcessing(`Deleting ${items.length} item(s)...`);

    try {
        for (const itemName of items) {
            const item = currentFiles.find(f => f.name === itemName);
            if (item) {
                // Temporarily hide processing for each individual delete
                hideProcessing();
                const success = await deleteItemAPI(itemName, item.isDirectory);
                if (success) successCount++;
            }
        }

        alert(`Deleted ${successCount} of ${items.length} item(s)`);
    } finally {
        hideProcessing();
        selectedFiles.clear();
        updateBulkActionsBar();
        await loadFiles(currentFolder);
    }
});

document.getElementById('bulkMoveBtn')?.addEventListener('click', () => {
    if (selectedFiles.size === 0) return;
    showFolderSelectionModal('move');
});

document.getElementById('bulkCopyBtn')?.addEventListener('click', () => {
    if (selectedFiles.size === 0) return;
    showFolderSelectionModal('copy');
});

// Delete item
async function deleteItem(itemName, isDirectory) {
    const itemType = isDirectory ? 'folder' : 'file';
    if (!confirm(`Are you sure you want to delete this ${itemType}? This action cannot be undone.`)) {
        return;
    }

    const success = await deleteItemAPI(itemName, isDirectory);
    if (success) {
        await loadFiles(currentFolder);
    }
}

async function deleteItemAPI(itemName, isDirectory) {
    showProcessing(`Deleting ${isDirectory ? 'folder' : 'file'}...`);
    
    try {
        const itemPath = currentFolder ? `${currentFolder}/${itemName}` : itemName;
        const res = await fetch(`${API_BASE}/github/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ghToken}`
            },
            body: JSON.stringify({
                owner: ghUser,
                repo: ghRepo,
                branch: ghBranch,
                path: itemPath,
                isDirectory
            })
        });

        if (res.ok) {
            return true;
        } else {
            alert('Failed to delete');
            return false;
        }
    } catch (err) {
        console.error(err);
        alert('Error deleting item');
        return false;
    } finally {
        hideProcessing();
    }
}

// Rename item
async function renameItem(itemName, isDirectory) {
    const newName = prompt(`Enter new name for this ${isDirectory ? 'folder' : 'file'}:`, itemName);
    if (!newName || newName.trim() === '' || newName === itemName) return;

    // Check for duplicates
    const existingNames = currentFiles
        .filter(item => item.isDirectory === isDirectory)
        .map(item => item.name);
    
    if (existingNames.includes(newName.trim())) {
        alert(`A ${isDirectory ? 'folder' : 'file'} with this name already exists!`);
        return;
    }

    showProcessing(`Renaming ${isDirectory ? 'folder' : 'file'}...`);
    
    try {
        const itemPath = currentFolder ? `${currentFolder}/${itemName}` : itemName;
        const res = await fetch(`${API_BASE}/github/rename`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ghToken}`
            },
            body: JSON.stringify({
                owner: ghUser,
                repo: ghRepo,
                branch: ghBranch,
                oldPath: itemPath,
                newName: newName.trim(),
                isDirectory
            })
        });

        if (res.ok) {
            await loadFiles(currentFolder);
        } else {
            alert('Failed to rename');
        }
    } catch (err) {
        console.error(err);
        alert('Error renaming item');
    } finally {
        hideProcessing();
    }
}

// Drag and drop handlers
function handleDragStart(e, item) {
    e.dataTransfer.effectAllowed = 'move';
    
    // Check if this item is part of a selection
    if (selectedFiles.has(item.name)) {
        // Dragging multiple selected items
        const selectedItems = Array.from(selectedFiles).map(name => {
            const fileItem = currentFiles.find(f => f.name === name);
            return { name, isDirectory: fileItem ? fileItem.isDirectory : false };
        });
        e.dataTransfer.setData('text/plain', JSON.stringify({ 
            multiple: true,
            items: selectedItems
        }));
    } else {
        // Dragging single item
        e.dataTransfer.setData('text/plain', JSON.stringify({ 
            multiple: false,
            name: item.name, 
            isDirectory: item.isDirectory 
        }));
    }
    
    e.currentTarget.classList.add('dragging');
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e, targetFolder) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const targetPath = currentFolder ? `${currentFolder}/${targetFolder.name}` : targetFolder.name;
        
        if (data.multiple) {
            // Moving multiple selected items
            const items = data.items;
            
            // Don't allow dropping on any of the selected items
            if (items.some(item => item.name === targetFolder.name)) return;
            
            if (confirm(`Move ${items.length} item(s) to "${targetFolder.name}"?`)) {
                showProcessing(`Moving ${items.length} item(s)...`);
                let successCount = 0;
                
                try {
                    for (const item of items) {
                        hideProcessing();
                        const success = await moveOrCopyItem(item.name, targetPath, 'move', item.isDirectory);
                        if (success) successCount++;
                    }
                    
                    alert(`Moved ${successCount} of ${items.length} item(s)`);
                } finally {
                    hideProcessing();
                    selectedFiles.clear();
                    updateBulkActionsBar();
                    await loadFiles(currentFolder);
                }
            }
        } else {
            // Moving single item
            const sourceName = data.name;
            const isDirectory = data.isDirectory;
            
            // Don't allow dropping on self
            if (sourceName === targetFolder.name) return;
            
            if (confirm(`Move "${sourceName}" to "${targetFolder.name}"?`)) {
                const success = await moveOrCopyItem(sourceName, targetPath, 'move', isDirectory);
                if (success) {
                    await loadFiles(currentFolder);
                }
            }
        }
    } catch (err) {
        console.error('Drop error:', err);
    }
}

// Sidebar drag and drop handlers
function handleSidebarDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.style.background = 'var(--primary-color)';
    e.currentTarget.style.color = 'white';
}

function handleSidebarDragLeave(e) {
    e.currentTarget.style.background = '';
    e.currentTarget.style.color = '';
}

async function handleSidebarDrop(e, targetFolderPath) {
    e.preventDefault();
    e.currentTarget.style.background = '';
    e.currentTarget.style.color = '';
    
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        
        if (data.multiple) {
            // Moving multiple selected items
            const items = data.items;
            const targetName = targetFolderPath === '' ? 'Home' : targetFolderPath.split('/').pop();
            
            if (confirm(`Move ${items.length} item(s) to "${targetName}"?`)) {
                showProcessing(`Moving ${items.length} item(s)...`);
                let successCount = 0;
                
                try {
                    for (const item of items) {
                        hideProcessing();
                        const success = await moveOrCopyItem(item.name, targetFolderPath, 'move', item.isDirectory);
                        if (success) successCount++;
                    }
                    
                    alert(`Moved ${successCount} of ${items.length} item(s)`);
                } finally {
                    hideProcessing();
                    selectedFiles.clear();
                    updateBulkActionsBar();
                    await loadFiles(currentFolder);
                    await loadSidebarFolders();
                }
            }
        } else {
            // Moving single item
            const sourceName = data.name;
            const isDirectory = data.isDirectory;
            const targetName = targetFolderPath === '' ? 'Home' : targetFolderPath.split('/').pop();
            
            if (confirm(`Move "${sourceName}" to "${targetName}"?`)) {
                const success = await moveOrCopyItem(sourceName, targetFolderPath, 'move', isDirectory);
                if (success) {
                    await loadFiles(currentFolder);
                    await loadSidebarFolders();
                }
            }
        }
    } catch (err) {
        console.error('Sidebar drop error:', err);
    }
}

// Folder selection modal for move/copy
let folderSelectionOperation = null;
const folderSelectionModal = document.getElementById('folderSelectionModal');
const closeFolderSelectionModal = document.getElementById('closeFolderSelectionModal');
const cancelFolderSelection = document.getElementById('cancelFolderSelection');
const confirmFolderSelection = document.getElementById('confirmFolderSelection');
let selectedDestFolder = null;

async function showFolderSelectionModal(operation) {
    folderSelectionOperation = operation;
    const title = document.getElementById('folderSelectionTitle');
    title.textContent = `Select Destination Folder (${operation === 'move' ? 'Move' : 'Copy'})`;
    
    // Load all folders
    await renderFolderTree();
    
    folderSelectionModal.classList.remove('hidden');
}

async function renderFolderTree() {
    const folderTree = document.getElementById('folderTree');
    folderTree.innerHTML = '<div style="padding: 0.5rem; cursor: pointer; hover:background: var(--hover-bg);" data-folder="" class="folder-tree-item"><i class="fas fa-home"></i> Home</div>';
    
    try {
        // Get all folders recursively
        const folders = await fetchAllFolders();
        folders.forEach(folder => {
            const indent = folder.split('/').length - 1;
            const div = document.createElement('div');
            div.className = 'folder-tree-item';
            div.style.paddingLeft = `${indent + 1}rem`;
            div.style.padding = '0.5rem';
            div.style.cursor = 'pointer';
            div.dataset.folder = folder;
            div.innerHTML = `<i class="fas fa-folder"></i> ${folder.split('/').pop()}`;
            div.onclick = () => selectDestFolder(folder);
            folderTree.appendChild(div);
        });
    } catch (err) {
        console.error('Error loading folders:', err);
    }
}

function selectDestFolder(folder) {
    selectedDestFolder = folder;
    document.querySelectorAll('.folder-tree-item').forEach(el => {
        el.style.background = el.dataset.folder === folder ? 'var(--primary-color)' : '';
        el.style.color = el.dataset.folder === folder ? 'white' : '';
    });
}

async function fetchAllFolders(path = '') {
    try {
        const items = await fetchGitHubFiles(path);
        const folders = [];
        
        for (const item of items) {
            if (item.isDirectory) {
                const folderPath = path ? `${path}/${item.name}` : item.name;
                folders.push(folderPath);
                // Recursively get subfolders
                const subFolders = await fetchAllFolders(folderPath);
                folders.push(...subFolders);
            }
        }
        
        return folders;
    } catch (err) {
        console.error('Error fetching folders:', err);
        return [];
    }
}

closeFolderSelectionModal?.addEventListener('click', () => {
    folderSelectionModal.classList.add('hidden');
    selectedDestFolder = null;
});

cancelFolderSelection?.addEventListener('click', () => {
    folderSelectionModal.classList.add('hidden');
    selectedDestFolder = null;
});

confirmFolderSelection?.addEventListener('click', async () => {
    if (selectedDestFolder === null) {
        alert('Please select a destination folder');
        return;
    }
    
    folderSelectionModal.classList.add('hidden');
    
    const items = Array.from(selectedFiles);
    let successCount = 0;
    
    showProcessing(`${folderSelectionOperation === 'move' ? 'Moving' : 'Copying'} ${items.length} item(s)...`);

    try {
        for (const itemName of items) {
            const item = currentFiles.find(f => f.name === itemName);
            if (item) {
                hideProcessing();
                const success = await moveOrCopyItem(itemName, selectedDestFolder, folderSelectionOperation, item.isDirectory);
                if (success) successCount++;
            }
        }

        alert(`${folderSelectionOperation === 'move' ? 'Moved' : 'Copied'} ${successCount} of ${items.length} item(s)`);
    } finally {
        hideProcessing();
        selectedFiles.clear();
        updateBulkActionsBar();
        await loadFiles(currentFolder);
        selectedDestFolder = null;
    }
});

async function moveOrCopyItem(itemName, destFolder, operation, isDirectory) {
    showProcessing(`${operation === 'move' ? 'Moving' : 'Copying'} ${isDirectory ? 'folder' : 'file'}...`);
    
    try {
        const sourcePath = currentFolder ? `${currentFolder}/${itemName}` : itemName;
        const res = await fetch(`${API_BASE}/github/move-copy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ghToken}`
            },
            body: JSON.stringify({
                owner: ghUser,
                repo: ghRepo,
                branch: ghBranch,
                sourcePath,
                destFolder,
                operation,
                isDirectory
            })
        });

        if (res.ok) {
            return true;
        } else {
            console.error(`Failed to ${operation}`);
            return false;
        }
    } catch (err) {
        console.error(err);
        return false;
    } finally {
        hideProcessing();
    }
}

init();

// Logout button event listener
document.getElementById('logoutBtn')?.addEventListener('click', logout);

