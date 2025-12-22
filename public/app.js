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
const editImageBtn = document.getElementById('editImageBtn');
const editTextBtn = document.getElementById('editTextBtn');
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


// Initialize Image Editor Module
let imageEditor = null;

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
window.currentFiles = currentFiles; // Expose globally for imageEditor
let searchTimeout;
let currentViewedFile = null; // Track the currently viewed file for sharing
let currentViewedFilePath = '';
let currentViewedImageBlob = null; // Store the loaded image blob for reuse in editor
let viewerCropper = null; // Cropper instance for image viewer
let selectedFiles = new Set(); // Track selected files for bulk operations
let selectionMode = false; // Track if we're in selection mode
let showThumbnails = localStorage.getItem('showThumbnails') === 'true'; // Track thumbnail preference
let lastClickedIndex = -1; // Track last clicked item for shift+click range selection
let sortBy = localStorage.getItem('sortBy') || 'name'; // Track sort criteria
let sortOrder = localStorage.getItem('sortOrder') || 'asc'; // Track sort order (asc/desc)

// Dark mode state
let darkMode = localStorage.getItem('darkMode') === 'true'; // Track dark mode preference

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

// Lazy Loading Observer
const thumbnailObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            const thumbnailUrl = img.dataset.thumbnailUrl;
            const item = currentFiles.find(f => f.name === img.dataset.fileName);

            if (thumbnailUrl && item && !item.thumbnailUrl) {
                // Fetch thumbnail
                fetch(thumbnailUrl, {
                    headers: { 'Authorization': `Bearer ${ghToken}` }
                })
                    .then(res => {
                        if (!res.ok) throw new Error('Failed to load thumbnail');
                        return res.blob();
                    })
                    .then(thumbnailBlob => {
                        const objectUrl = URL.createObjectURL(thumbnailBlob);
                        img.src = objectUrl;
                        img.classList.remove('loading');

                        // Store the object URL in the item for use in viewer
                        item.thumbnailUrl = objectUrl;
                    })
                    .catch(err => {
                        console.error('Thumbnail load error:', err);
                        img.classList.remove('loading');
                        img.style.display = 'none';
                        // Show icon fallback
                        const card = img.closest('.file-card');
                        if (card) {
                            const icon = card.querySelector('.file-icon');
                            if (icon) icon.style.display = 'block';
                        }
                    });
            }

            observer.unobserve(img);
        }
    });
}, {
    root: null, // viewport
    rootMargin: '50px', // load slightly before visible
    threshold: 0.1
});

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

    // Add click handler for profile to show rate limit
    const userProfile = document.querySelector('.user-profile');
    if (userProfile) {
        userProfile.style.cursor = 'pointer';
        userProfile.addEventListener('click', showRateLimitModal);
    }
}

// Show Rate Limit Modal
function showRateLimitModal() {
    const modal = document.getElementById('rateLimitModal');
    const loading = document.getElementById('rateLimitLoading');
    const content = document.getElementById('rateLimitContent');
    const error = document.getElementById('rateLimitError');

    // Reset state
    loading.style.display = 'block';
    content.style.display = 'none';
    error.style.display = 'none';

    modal.classList.remove('hidden');

    // Fetch rate limit data
    fetchRateLimit();
    fetchRepoSize();
}

// Fetch GitHub rate limit
async function fetchRateLimit() {
    try {
        const response = await fetch(`${API_BASE}/github/rate-limit`, {
            headers: {
                'x-gh-token': ghToken
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch rate limit');
        }

        const data = await response.json();

        // Update UI
        document.getElementById('totalTokens').textContent = data.limit.toLocaleString();
        document.getElementById('remainingTokens').textContent = data.remaining.toLocaleString();

        // Format reset time
        const resetDate = new Date(data.reset * 1000);
        const now = new Date();
        const diffMs = resetDate - now;
        const diffMins = Math.floor(diffMs / 60000);
        const diffSecs = Math.floor((diffMs % 60000) / 1000);

        // Format time only
        const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
        const timeStr = resetDate.toLocaleTimeString('en-US', timeOptions);
        document.getElementById('renewTime').textContent = timeStr;

        // Format countdown
        let countdownText = '';
        if (diffMs > 0) {
            if (diffMins > 60) {
                const hours = Math.floor(diffMins / 60);
                const mins = diffMins % 60;
                countdownText = `Resets in ${hours}h ${mins}m`;
            } else if (diffMins > 0) {
                countdownText = `Resets in ${diffMins}m ${diffSecs}s`;
            } else {
                countdownText = `Resets in ${diffSecs}s`;
            }
        } else {
            countdownText = 'Reset available';
        }
        document.getElementById('renewCountdown').textContent = countdownText;

        // Calculate usage percentage
        const used = data.limit - data.remaining;
        const usagePercent = ((used / data.limit) * 100).toFixed(1);
        document.getElementById('usagePercentage').textContent = `${usagePercent}%`;
        document.getElementById('rateLimitProgressBar').style.width = `${usagePercent}%`;

        // Color code based on remaining
        const remainingElem = document.getElementById('remainingTokens');
        if (data.remaining < data.limit * 0.1) {
            remainingElem.style.color = '#ef4444'; // Red
        } else if (data.remaining < data.limit * 0.3) {
            remainingElem.style.color = '#f59e0b'; // Orange
        } else {
            remainingElem.style.color = '#10b981'; // Green
        }

        // Show content
        document.getElementById('rateLimitLoading').style.display = 'none';
        document.getElementById('rateLimitContent').style.display = 'block';
    } catch (error) {
        console.error('Error fetching rate limit:', error);
        document.getElementById('rateLimitLoading').style.display = 'none';
        document.getElementById('rateLimitError').style.display = 'block';
    }
}

// Fetch GitHub repository size
async function fetchRepoSize() {
    const storageLoading = document.getElementById('storageLoading');
    const storageContent = document.getElementById('storageContent');
    const storageError = document.getElementById('storageError');

    // Reset state
    storageLoading.style.display = 'block';
    storageContent.style.display = 'none';
    storageError.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/github/repo-size`, {
            headers: {
                'x-gh-token': ghToken,
                'x-gh-user': ghUser,
                'x-gh-repo': ghRepo
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch repository size');
        }

        const data = await response.json();

        // Format size display
        let sizeDisplay;
        if (data.sizeKB < 1024) {
            sizeDisplay = `${data.sizeKB} KB`;
        } else if (data.sizeKB < 1024 * 1024) {
            sizeDisplay = `${data.sizeMB} MB`;
        } else {
            sizeDisplay = `${data.sizeGB} GB`;
        }

        document.getElementById('repoSize').textContent = sizeDisplay;

        // Calculate percentages for both storage tiers
        const fastStorageLimit = 1024 * 1024 * 1024; // 1GB in bytes
        const slowStorageLimit = 100 * 1024 * 1024 * 1024; // 100GB in bytes

        const fastStoragePercent = ((data.size / fastStorageLimit) * 100).toFixed(2);
        const slowStoragePercent = ((data.size / slowStorageLimit) * 100).toFixed(2);

        // Update fast storage (1GB)
        document.getElementById('fastStoragePercentage').textContent = `${fastStoragePercent}%`;
        document.getElementById('fastStorageProgressBar').style.width = `${Math.min(fastStoragePercent, 100)}%`;

        // Color code fast storage
        const fastBar = document.getElementById('fastStorageProgressBar');
        if (fastStoragePercent >= 90) {
            fastBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)'; // Red
        } else if (fastStoragePercent >= 70) {
            fastBar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)'; // Orange
        } else {
            fastBar.style.background = 'linear-gradient(90deg, #10b981, #3b82f6)'; // Green-Blue
        }

        // Update slow storage (100GB)
        document.getElementById('slowStoragePercentage').textContent = `${slowStoragePercent}%`;
        document.getElementById('slowStorageProgressBar').style.width = `${Math.min(slowStoragePercent, 100)}%`;

        // Color code slow storage
        const slowBar = document.getElementById('slowStorageProgressBar');
        if (slowStoragePercent >= 90) {
            slowBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)'; // Red
        } else if (slowStoragePercent >= 70) {
            slowBar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)'; // Orange
        } else {
            slowBar.style.background = 'linear-gradient(90deg, #6366f1, #8b5cf6)'; // Purple
        }

        // Show content
        storageLoading.style.display = 'none';
        storageContent.style.display = 'block';
    } catch (error) {
        console.error('Error fetching repository size:', error);
        storageLoading.style.display = 'none';
        storageError.style.display = 'block';
    }
}

// Close Rate Limit Modal
document.getElementById('closeRateLimitModal')?.addEventListener('click', () => {
    document.getElementById('rateLimitModal').classList.add('hidden');
});

// Close modal on outside click
document.getElementById('rateLimitModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'rateLimitModal') {
        document.getElementById('rateLimitModal').classList.add('hidden');
    }
});

// Open Project Info Modal
document.getElementById('openProjectInfo')?.addEventListener('click', () => {
    document.getElementById('projectInfoModal').classList.remove('hidden');
});

// Close Project Info Modal
document.getElementById('closeProjectInfoModal')?.addEventListener('click', () => {
    document.getElementById('projectInfoModal').classList.add('hidden');
});

// Close modal on outside click
document.getElementById('projectInfoModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'projectInfoModal') {
        document.getElementById('projectInfoModal').classList.add('hidden');
    }
});

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

    // Initialize dark mode
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.checked = darkMode;
        // Apply dark mode on load
        if (darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
        darkModeToggle.addEventListener('change', (e) => {
            darkMode = e.target.checked;
            localStorage.setItem('darkMode', darkMode);
            if (darkMode) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        });
    }

    // Initialize thumbnail toggle
    const thumbnailToggle = document.getElementById('showThumbnails');
    if (thumbnailToggle) {
        thumbnailToggle.checked = showThumbnails;
        thumbnailToggle.addEventListener('change', (e) => {
            showThumbnails = e.target.checked;
            localStorage.setItem('showThumbnails', showThumbnails);
            renderFiles(currentFiles); // Re-render with/without thumbnails
        });
    }

    // Initialize Locked Folder toggle
    const lockedFolderToggle = document.getElementById('showLockedFolder');
    if (lockedFolderToggle) {
        const showLockedFolder = localStorage.getItem('showLockedFolder') === 'true';
        lockedFolderToggle.checked = showLockedFolder;
        lockedFolderToggle.addEventListener('change', async (e) => {
            localStorage.setItem('showLockedFolder', e.target.checked);
            // Reload both sidebar and current folder to show/hide Locked Folder
            await loadSidebarFolders();
            await loadFiles(currentFolder);
        });
    }

    // Initialize hard refresh button
    const hardRefreshBtn = document.getElementById('hardRefreshBtn');
    if (hardRefreshBtn) {
        hardRefreshBtn.addEventListener('click', () => {
            // Clear cache and perform hard refresh
            if ('caches' in window) {
                caches.keys().then((names) => {
                    names.forEach(name => {
                        caches.delete(name);
                    });
                });
            }
            // Force reload from server (bypass cache)
            window.location.reload(true);
        });
    }

    // Keyboard shortcuts button
    const shortcutsBtn = document.getElementById('shortcutsBtn');
    if (shortcutsBtn) {
        shortcutsBtn.addEventListener('click', () => {
            if (shortcutsModal) {
                shortcutsModal.classList.remove('hidden');
            }
        });
    }

    // Sort controls
    const sortBySelect = document.getElementById('sortBy');
    const sortOrderBtn = document.getElementById('sortOrderBtn');
    
    if (sortBySelect) {
        sortBySelect.value = sortBy;
        sortBySelect.addEventListener('change', (e) => {
            sortBy = e.target.value;
            localStorage.setItem('sortBy', sortBy);
            if (currentFiles && currentFiles.length > 0) {
                renderFiles(currentFiles);
            }
        });
    }
    
    if (sortOrderBtn) {
        updateSortOrderIcon();
        sortOrderBtn.addEventListener('click', () => {
            sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
            localStorage.setItem('sortOrder', sortOrder);
            updateSortOrderIcon();
            if (currentFiles && currentFiles.length > 0) {
                renderFiles(currentFiles);
            }
        });
    }
    
    function updateSortOrderIcon() {
        if (sortOrderBtn) {
            const icon = sortOrderBtn.querySelector('i');
            if (icon) {
                const iconMap = {
                    'name': sortOrder === 'asc' ? 'fa-sort-alpha-down' : 'fa-sort-alpha-up',
                    'date': sortOrder === 'asc' ? 'fa-sort-numeric-down' : 'fa-sort-numeric-up',
                    'size': sortOrder === 'asc' ? 'fa-sort-numeric-down' : 'fa-sort-numeric-up',
                    'type': sortOrder === 'asc' ? 'fa-sort-alpha-down' : 'fa-sort-alpha-up'
                };
                icon.className = `fas ${iconMap[sortBy] || 'fa-sort-alpha-down'}`;
                sortOrderBtn.title = sortOrder === 'asc' ? 'Ascending order' : 'Descending order';
            }
        }
    }

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
        await renderSidebarFolders(folders);
    } catch (err) {
        console.error('Failed to load sidebar folders', err);
    }
}

async function renderSidebarFolders(folders) {
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

    // Check if Locked Folder should be shown
    const showLockedFolder = localStorage.getItem('showLockedFolder') === 'true';

    // Render regular folders (excluding Locked Folder if it exists)
    folders.filter(folder => folder !== 'Locked Folder').forEach(folder => {
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

    // Add Locked Folder at the bottom with dynamic icon (only if enabled)
    if (!showLockedFolder) {
        return; // Exit if Locked Folder is disabled
    }
    
    const lockedFolderLi = document.createElement('li');
    lockedFolderLi.className = 'folder-item locked-folder-item';
    if (currentFolder === 'Locked Folder' || currentFolder.startsWith('Locked Folder/')) {
        lockedFolderLi.classList.add('active');
    }
    
    // Determine icon based on state
    const isLocked = await checkFolderLocked('Locked Folder');
    const isUnlocked = unlockedFolders.has('Locked Folder');
    
    let icon, label, style;
    if (!isLocked) {
        // No password set - show key icon
        icon = 'fa-key';
        label = 'Locked Folder';
        style = 'color: #6b7280;';
    } else if (isUnlocked) {
        // Password set and unlocked - show unlock icon
        icon = 'fa-unlock';
        label = 'Locked Folder';
        style = 'color: #10b981;';
    } else {
        // Password set and locked - show lock icon
        icon = 'fa-lock';
        label = 'Locked Folder';
        style = 'color: #ef4444;';
    }
    
    lockedFolderLi.innerHTML = `
        <i class="fas ${icon}" style="${style}"></i> 
        <span>${label}</span>
        <button class="key-action-btn" title="${!isLocked ? 'Set password' : (isUnlocked ? 'Unlocked' : 'Unlock folder')}">
            <i class="fas ${!isLocked ? 'fa-key' : (isUnlocked ? 'fa-unlock' : 'fa-lock')}" style="${!isLocked ? 'color: #6b7280;' : (isUnlocked ? 'color: #10b981;' : 'color: #ef4444;')}"></i>
        </button>
    `;
    
    // Handle key button click
    const keyBtn = lockedFolderLi.querySelector('.key-action-btn');
    keyBtn.onclick = async (e) => {
        e.stopPropagation();
        showLockFolderDialog('Locked Folder');
    };
    
    lockedFolderLi.onclick = async () => {
        if (!isLocked) {
            // No password set - show set password dialog
            showLockFolderDialog('Locked Folder');
        } else if (isUnlocked) {
            // Already unlocked - navigate normally
            selectFolder('Locked Folder');
        } else {
            // Locked - show unlock dialog
            selectFolder('Locked Folder');
        }
    };

    // Add drag and drop handlers
    lockedFolderLi.ondragover = (e) => handleSidebarDragOver(e);
    lockedFolderLi.ondragleave = (e) => handleSidebarDragLeave(e);
    lockedFolderLi.ondrop = (e) => handleSidebarDrop(e, 'Locked Folder');

    folderList.appendChild(lockedFolderLi);
}

// --- Main Folder Operations ---
async function selectFolder(folderPath, updateUrl = true) {
    currentFolder = folderPath || '';
    lastClickedIndex = -1; // Reset range selection when switching folders

    // Check if accessing "Locked Folder" or any subfolder within it
    const isLockedFolderPath = currentFolder === 'Locked Folder' || currentFolder.startsWith('Locked Folder/');
    
    if (isLockedFolderPath) {
        const isLocked = await checkFolderLocked('Locked Folder');
        
        if (isLocked && !unlockedFolders.has('Locked Folder')) {
            // Show unlock dialog for Locked Folder
            showLockFolderDialog('Locked Folder');
            return;
        }
    }

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
        const separatorWrapper = document.createElement('span');
        separatorWrapper.className = 'breadcrumb-separator-wrapper';
        separatorWrapper.style.position = 'relative';
        
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.innerHTML = '<i class="fas fa-chevron-right"></i>';
        
        // Add click handler to show dropdown with sibling directories
        const parentPath = parts.slice(0, index).join('/');
        separator.onclick = async (e) => {
            e.stopPropagation();
            await showBreadcrumbDropdown(separatorWrapper, parentPath);
        };
        
        separatorWrapper.appendChild(separator);
        breadcrumbsContainer.appendChild(separatorWrapper);

        currentPath += (index > 0 ? '/' : '') + part;
        const partPath = currentPath; // Capture for closure

        const link = document.createElement('span');
        link.className = 'breadcrumb-item';
        link.textContent = part;
        link.onclick = () => selectFolder(partPath);
        breadcrumbsContainer.appendChild(link);
    });
}

// Show dropdown with sibling directories
async function showBreadcrumbDropdown(separatorWrapper, parentPath) {
    // Remove any existing dropdowns
    document.querySelectorAll('.breadcrumb-dropdown').forEach(d => d.remove());
    
    // Create dropdown with loading state
    const dropdown = document.createElement('div');
    dropdown.className = 'breadcrumb-dropdown';
    
    // Show loading state
    const loadingItem = document.createElement('div');
    loadingItem.className = 'breadcrumb-dropdown-item breadcrumb-dropdown-loading';
    loadingItem.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 0.5rem;"></i><span>Loading...</span>';
    dropdown.appendChild(loadingItem);
    
    separatorWrapper.appendChild(dropdown);
    
    try {
        const data = await fetchGitHubFiles(parentPath);
        const directories = data.filter(item => item.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
        
        // Clear loading state
        dropdown.innerHTML = '';
        
        if (directories.length === 0) {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'breadcrumb-dropdown-item';
            emptyItem.style.color = 'var(--secondary-text)';
            emptyItem.style.cursor = 'default';
            emptyItem.innerHTML = '<i class="fas fa-folder-open" style="margin-right: 0.5rem;"></i><span>No folders</span>';
            dropdown.appendChild(emptyItem);
        } else {
            directories.forEach(dir => {
                const item = document.createElement('div');
                item.className = 'breadcrumb-dropdown-item';
                
                const icon = document.createElement('i');
                icon.className = 'fas fa-folder';
                icon.style.marginRight = '0.5rem';
                icon.style.color = '#f59e0b';
                
                const name = document.createElement('span');
                name.textContent = dir.name;
                
                item.appendChild(icon);
                item.appendChild(name);
                
                item.onclick = () => {
                    const newPath = parentPath ? `${parentPath}/${dir.name}` : dir.name;
                    selectFolder(newPath);
                    dropdown.remove();
                };
                
                dropdown.appendChild(item);
            });
        }
        
        // Close dropdown when clicking outside
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target) && !separatorWrapper.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeDropdown);
        }, 10);
        
    } catch (err) {
        console.error('Failed to fetch directories for breadcrumb dropdown:', err);
        dropdown.innerHTML = '';
        const errorItem = document.createElement('div');
        errorItem.className = 'breadcrumb-dropdown-item';
        errorItem.style.color = '#ef4444';
        errorItem.style.cursor = 'default';
        errorItem.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right: 0.5rem;"></i><span>Failed to load</span>';
        dropdown.appendChild(errorItem);
    }
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

// Helper function to create low-quality thumbnail
function createLowQualityThumbnail(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            // Create canvas for thumbnail
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Calculate thumbnail dimensions (max 200px)
            const maxSize = 200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxSize) {
                    height = (height / width) * maxSize;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width = (width / height) * maxSize;
                    height = maxSize;
                }
            }

            canvas.width = width;
            canvas.height = height;

            // Draw image at reduced size
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to blob with low quality
            canvas.toBlob((thumbnailBlob) => {
                URL.revokeObjectURL(url);
                resolve(thumbnailBlob);
            }, 'image/jpeg', 0.5); // 50% quality
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for thumbnail'));
        };

        img.src = url;
    });
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
        // Revoke existing thumbnail URLs to prevent memory leaks
        if (currentFiles && currentFiles.length > 0) {
            currentFiles.forEach(file => {
                if (file.thumbnailUrl) {
                    URL.revokeObjectURL(file.thumbnailUrl);
                    file.thumbnailUrl = null;
                }
            });
        }

        fileGrid.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';
        const items = await fetchGitHubFiles(folder);
        currentFiles = items;
        window.currentFiles = items; // Update global reference
        await renderFiles(items);
        
        // Reload sidebar to update Locked Folder icon if at root
        if (folder === '') {
            await loadSidebarFolders();
        }
    } catch (err) {
        console.error('Failed to load files', err);
        fileGrid.innerHTML = `<div class="empty-state"><p style="color:red">Failed to load content. Check your connection or repo settings.</p></div>`;
    }
}

function sortFiles(items) {
    // Separate folders and files
    const folders = items.filter(item => item.isDirectory);
    const files = items.filter(item => !item.isDirectory);
    
    // Sort function based on criteria
    const sortFn = (a, b) => {
        let comparison = 0;
        
        switch(sortBy) {
            case 'name':
                comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                break;
            case 'date':
                // GitHub API doesn't provide modified date in directory listing, so we'll sort by name as fallback
                comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                break;
            case 'size':
                comparison = (a.size || 0) - (b.size || 0);
                break;
            case 'type':
                const typeA = a.isDirectory ? 'folder' : (a.type || a.name.split('.').pop() || '');
                const typeB = b.isDirectory ? 'folder' : (b.type || b.name.split('.').pop() || '');
                comparison = typeA.localeCompare(typeB);
                break;
        }
        
        return sortOrder === 'asc' ? comparison : -comparison;
    };
    
    // Sort folders and files separately
    folders.sort(sortFn);
    files.sort(sortFn);
    
    // Return folders first, then files
    return [...folders, ...files];
}

async function renderFiles(items) {
    fileGrid.innerHTML = '';
    
    // Check if Locked Folder should be shown
    const showLockedFolder = localStorage.getItem('showLockedFolder') === 'true';
    
    // Filter out Locked Folder from items if disabled
    if (!showLockedFolder && currentFolder === '') {
        items = items.filter(item => item.name !== 'Locked Folder');
    }
    
    // If at root level, automatically add Locked Folder if not present AND if enabled
    if (currentFolder === '' && showLockedFolder) {
        const hasLockedFolder = items.some(item => item.name === 'Locked Folder' && item.isDirectory);
        if (!hasLockedFolder) {
            // Add virtual Locked Folder entry
            items.push({
                name: 'Locked Folder',
                isDirectory: true,
                size: 0,
                type: 'folder',
                date: new Date(),
                isVirtual: true // Mark as virtual to handle differently
            });
        }
    }
    
    if (items.length === 0) {
        fileGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>This folder is empty</p>
            </div>`;
        return;
    }
    
    // Sort items before rendering
    const sortedItems = sortFiles(items);

    for (let index = 0; index < sortedItems.length; index++) {
        const item = sortedItems[index];
        const card = document.createElement('div');
        card.className = 'file-card';
        card.dataset.itemName = item.name;
        card.dataset.isDirectory = item.isDirectory;
        card.dataset.itemIndex = index;

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
            
            // Handle Shift+Click for range selection
            if (e.shiftKey && lastClickedIndex !== -1 && lastClickedIndex !== index) {
                selectRange(lastClickedIndex, index, item.name);
            } else {
                toggleFileSelection(item.name);
                lastClickedIndex = index;
            }
        };
        card.appendChild(checkbox);

        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'file-card-actions';
        const itemPath = currentFolder ? `${currentFolder}/${item.name}` : item.name;
        
        // Add lock button only for the "Locked Folder" itself when at root level
        const isLockedFolderAtRoot = item.isDirectory && item.name === 'Locked Folder' && currentFolder === '';
        const lockButton = isLockedFolderAtRoot ? 
            `<button class="file-action-btn" onclick="event.stopPropagation(); showLockFolderDialog('Locked Folder')" title="Set/Change Password">
                <i class="fas fa-key"></i>
            </button>` : '';
        
        actionsDiv.innerHTML = `
            <button class="file-action-btn" onclick="event.stopPropagation(); showPropertiesModal('${encodeURIComponent(itemPath)}', '${encodeURIComponent(item.name)}', ${item.isDirectory})" title="Properties">
                <i class="fas fa-info-circle"></i>
            </button>
            ${lockButton}
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
            // Special handling for Locked Folder
            if (item.name === 'Locked Folder' && currentFolder === '') {
                const isLocked = await checkFolderLocked('Locked Folder');
                const isUnlocked = unlockedFolders.has('Locked Folder');
                
                if (!isLocked) {
                    // No password set - show key icon
                    fileIcon.className = 'file-icon fas fa-key';
                    fileIcon.style.color = '#6b7280';
                    fileMeta.innerHTML = 'Click to set password';
                } else if (isUnlocked) {
                    // Password set and unlocked - show unlock icon
                    fileIcon.className = 'file-icon fas fa-folder-open';
                    fileIcon.style.color = '#10b981';
                    fileMeta.innerHTML = 'Unlocked';
                } else {
                    // Password set and locked - show lock icon
                    fileIcon.className = 'file-icon fas fa-lock';
                    fileIcon.style.color = '#ef4444';
                    fileMeta.innerHTML = 'Password protected';
                }
            } else {
                fileIcon.className = 'file-icon fas fa-folder';
                fileIcon.style.color = '#fbbf24';
                fileMeta.textContent = 'Folder';
            }

            card.appendChild(fileIcon);
            card.appendChild(fileName);
            card.appendChild(fileMeta);

            // Navigate into folder
            const newPath = currentFolder ? `${currentFolder}/${item.name}` : item.name;
            card.onclick = async (e) => {
                if (!e.target.closest('.file-card-checkbox') && !e.target.closest('.file-card-actions')) {
                    // Special handling for Locked Folder at root
                    if (item.name === 'Locked Folder' && currentFolder === '') {
                        const isLocked = await checkFolderLocked('Locked Folder');
                        const isUnlocked = unlockedFolders.has('Locked Folder');
                        
                        if (!isLocked) {
                            // No password set - show set password dialog
                            showLockFolderDialog('Locked Folder');
                            return;
                        }
                    }
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

            // Create thumbnail element for images (including iPhone formats)
            const isImage = (item.type && item.type.includes('image')) || item.name.match(/\.(heic|heif)$/i);
            if (isImage) {
                const thumbnail = document.createElement('img');
                thumbnail.className = 'file-thumbnail';
                thumbnail.alt = '';
                thumbnail.loading = 'lazy'; // Lazy load thumbnails

                // Add loading class initially (show loading state)
                thumbnail.classList.add('loading');
                thumbnail.dataset.fileName = item.name;

                // Load thumbnail using server-side thumbnail endpoint
                const filePath = itemFolder ? `${itemFolder}/${item.name}` : item.name;
                const thumbnailUrl = `${API_BASE}/github/thumbnail?owner=${ghUser}&repo=${ghRepo}&branch=${ghBranch}&path=${encodeURIComponent(filePath)}&size=200`;

                thumbnail.dataset.thumbnailUrl = thumbnailUrl;

                // Observe for lazy loading
                thumbnailObserver.observe(thumbnail);

                // Add error handler for img element
                thumbnail.onerror = () => {
                    thumbnail.classList.remove('loading');
                    thumbnail.style.display = 'none';
                    fileIcon.style.display = 'block';
                };

                card.appendChild(thumbnail);

                // Show thumbnail if toggle is enabled
                if (showThumbnails) {
                    card.classList.add('show-thumbnail');
                }
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
    }
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

// Allow pasting files directly into the current folder
document.addEventListener('paste', (e) => {
    const active = document.activeElement;
    const isTypingTarget = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    if (isTypingTarget) return;

    const clipboardFiles = e.clipboardData && e.clipboardData.files;
    if (!clipboardFiles || clipboardFiles.length === 0) return;

    e.preventDefault();
    handleUpload(clipboardFiles);
});

// Show duplicate files modal and return user action
function showDuplicateFilesModal(duplicateFiles, newFilesCount) {
    return new Promise((resolve) => {
        const modal = document.getElementById('duplicateFilesModal');
        const filesInfo = document.getElementById('duplicateFilesInfo');
        const filesList = document.getElementById('duplicateFilesList');
        const buttonsContainer = document.getElementById('duplicateButtonsContainer');
        const cancelBtn = document.getElementById('cancelDuplicateBtn');
        const skipBtn = document.getElementById('skipDuplicateBtn');
        const renameBtn = document.getElementById('renameDuplicateBtn');
        const overrideBtn = document.getElementById('overrideDuplicateBtn');
        
        // Show file counts and adjust button layout
        if (newFilesCount > 0) {
            filesInfo.innerHTML = `<i class="fas fa-check-circle" style="color: #10b981;"></i> ${newFilesCount} new file(s) + <i class="fas fa-exclamation-circle" style="color: #f59e0b;"></i> ${duplicateFiles.length} duplicate(s)`;
            skipBtn.style.display = 'block';
            // 4 buttons: 2x2 grid
            buttonsContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
        } else {
            filesInfo.innerHTML = `<i class="fas fa-exclamation-circle" style="color: #f59e0b;"></i> ${duplicateFiles.length} duplicate file(s) found`;
            skipBtn.style.display = 'none';
            // 3 buttons: single row
            buttonsContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
        }
        
        // Populate files list
        filesList.innerHTML = duplicateFiles.map(f => 
            `<div style="padding: 0.75rem; color: var(--text-color); border: 1px solid var(--border-color); border-radius: 2rem;"><i class="fas fa-file" style="margin-right: 0.5rem; color: #f59e0b;"></i>${f}</div>`
        ).join('');
        
        // Show modal
        modal.classList.remove('hidden');
        
        // Set up event handlers
        const cleanup = () => {
            modal.classList.add('hidden');
            cancelBtn.onclick = null;
            skipBtn.onclick = null;
            renameBtn.onclick = null;
            overrideBtn.onclick = null;
        };
        
        cancelBtn.onclick = () => {
            cleanup();
            resolve('cancel');
        };
        
        skipBtn.onclick = () => {
            cleanup();
            resolve('skip');
        };
        
        renameBtn.onclick = () => {
            cleanup();
            resolve('rename');
        };
        
        overrideBtn.onclick = () => {
            cleanup();
            resolve('override');
        };
    });
}

// Handle renaming duplicate files
async function handleRenameFiles(files, duplicateNames) {
    const filesArray = Array.from(files);
    const renamedFiles = [];
    
    for (const file of filesArray) {
        if (duplicateNames.includes(file.name)) {
            // Ask user for new name
            const nameParts = file.name.split('.');
            const extension = nameParts.length > 1 ? '.' + nameParts.pop() : '';
            const baseName = nameParts.join('.');
            
            let newName = prompt(`Enter new name for "${file.name}":`, `${baseName}_copy${extension}`);
            
            if (!newName) {
                // User cancelled, skip this file
                continue;
            }
            
            // Ensure extension is preserved if not included
            if (extension && !newName.endsWith(extension)) {
                newName += extension;
            }
            
            // Create a new File object with the new name
            const renamedFile = new File([file], newName, { type: file.type });
            renamedFiles.push(renamedFile);
        } else {
            renamedFiles.push(file);
        }
    }
    
    return renamedFiles;
}

async function handleUpload(files) {
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    // GitHub file size limit is 100MB
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes
    const oversizedFiles = [];
    let validFiles = [];
    const duplicateFiles = [];
    const duplicateFileObjects = [];
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
            duplicateFileObjects.push(file);
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
        const action = await showDuplicateFilesModal(duplicateFiles, validFiles.length);
        
        if (action === 'cancel') {
            uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload';
            uploadBtn.disabled = false;
            return;
        } else if (action === 'skip') {
            // Continue with only new files, skip duplicates
            // validFiles already contains only new files
        } else if (action === 'rename') {
            // Handle renaming duplicates - only rename the duplicate ones
            const renamedDuplicates = await handleRenameFiles(duplicateFileObjects, duplicateFiles);
            // Add renamed files to validFiles
            validFiles = [...validFiles, ...renamedDuplicates];
        } else if (action === 'override') {
            // Add duplicate files to validFiles - server will override them
            validFiles = [...validFiles, ...duplicateFileObjects];
        }
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
    
    // Update navigation buttons visibility
    updateNavigationButtons(file);
    
    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    const folderToUse = folderOverride !== null ? folderOverride : currentFolder;

    // Show/hide edit buttons based on file type
    if (editImageBtn) {
        const isEditableImage = file.type.includes('image') || file.name.match(/\.(heic|heif)$/i);
        editImageBtn.style.display = isEditableImage ? 'block' : 'none';
        console.log('Image edit button:', isEditableImage ? 'shown' : 'hidden', 'for', file.name);
    }
    if (editTextBtn) {
        const isEditableText = file.name.match(/\.(txt|json|md|html|css|js|log|csv|xml|yml|yaml|ini|conf|cfg)$/i);
        editTextBtn.style.display = isEditableText ? 'block' : 'none';
        console.log('Text edit button:', isEditableText ? 'shown' : 'hidden', 'for', file.name, 'matched:', isEditableText);
    } else {
        console.log('editTextBtn element not found!');
    }

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
    viewerBody.innerHTML = '';

    // Check if we have a thumbnail to show immediately
    const isImageFile = file.type.includes('image') || file.name.match(/\.(heic|heif)$/i);
    let thumbnailImg = null;

    if (isImageFile && file.thumbnailUrl) {
        // Create thumbnail image immediately
        thumbnailImg = document.createElement('img');
        thumbnailImg.style.width = '100%';
        thumbnailImg.style.height = '100%';
        thumbnailImg.style.objectFit = 'contain';
        thumbnailImg.style.backgroundImage = `url(${file.thumbnailUrl})`;
        thumbnailImg.style.backgroundSize = 'contain';
        thumbnailImg.style.backgroundRepeat = 'no-repeat';
        thumbnailImg.style.backgroundPosition = 'center';
        thumbnailImg.style.filter = 'blur(10px)';
        thumbnailImg.style.transition = 'filter 0.3s ease';

        // Add spinner on top
        const spinner = document.createElement('div');
        spinner.className = 'viewer-spinner';
        spinner.innerHTML = '<i class="fas fa-spinner fa-spin" style="color: white; font-size: 2rem; text-shadow: 0 0 5px rgba(0,0,0,0.5);"></i>';
        spinner.style.position = 'absolute';
        spinner.style.top = '50%';
        spinner.style.left = '50%';
        spinner.style.transform = 'translate(-50%, -50%)';
        spinner.style.zIndex = '10';

        viewerBody.appendChild(thumbnailImg);
        viewerBody.appendChild(spinner);
    } else if (isImageFile) {
        // Thumbnail not available yet, fetch it immediately
        viewerBody.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading preview...</p></div>';

        const filePath = folderToUse ? `${folderToUse}/${file.name}` : file.name;
        const thumbnailUrl = `${API_BASE}/github/thumbnail?owner=${ghUser}&repo=${ghRepo}&branch=${ghBranch}&path=${encodeURIComponent(filePath)}&size=200`;

        fetch(thumbnailUrl, { headers: { 'Authorization': `Bearer ${ghToken}` } })
            .then(res => {
                if (res.ok) return res.blob();
                throw new Error('Thumbnail failed');
            })
            .then(blob => {
                const objectUrl = URL.createObjectURL(blob);
                file.thumbnailUrl = objectUrl; // Cache it

                // Check if we are still waiting for the full image
                // The full image loader replaces viewerBody content on load.
                // So if viewerBody still contains the empty-state loading message, we can swap it.
                if (currentViewedFile && currentViewedFile.name === file.name) {
                    const emptyState = viewerBody.querySelector('.empty-state');
                    if (emptyState) {
                        // Swap to thumbnail view
                        viewerBody.innerHTML = '';

                        const thumbnailImg = document.createElement('img');
                        thumbnailImg.style.width = '100%';
                        thumbnailImg.style.height = '100%';
                        thumbnailImg.style.objectFit = 'contain';
                        thumbnailImg.style.backgroundImage = `url(${file.thumbnailUrl})`;
                        thumbnailImg.style.backgroundSize = 'contain';
                        thumbnailImg.style.backgroundRepeat = 'no-repeat';
                        thumbnailImg.style.backgroundPosition = 'center';
                        thumbnailImg.style.filter = 'blur(10px)';
                        thumbnailImg.style.transition = 'filter 0.3s ease';

                        const spinner = document.createElement('div');
                        spinner.className = 'viewer-spinner';
                        spinner.innerHTML = '<i class="fas fa-spinner fa-spin" style="color: white; font-size: 2rem; text-shadow: 0 0 5px rgba(0,0,0,0.5);"></i>';
                        spinner.style.position = 'absolute';
                        spinner.style.top = '50%';
                        spinner.style.left = '50%';
                        spinner.style.transform = 'translate(-50%, -50%)';
                        spinner.style.zIndex = '10';

                        viewerBody.appendChild(thumbnailImg);
                        viewerBody.appendChild(spinner);
                    }
                }
            })
            .catch(err => console.log('Thumbnail fetch failed/skipped', err));
    } else {
        // Default loading state
        viewerBody.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading preview...</p></div>';
    }

    const isDoc = file.name.match(/\.(docx|doc|xlsx|xls|pptx|ppt)$/i);
    const isText = file.name.match(/\.(txt|json|js|css|html)$/i);
    const isMarkdown = file.name.match(/\.md$/i);
    const isCsv = file.name.match(/\.csv$/i);
    const isVideo = file.type.includes('video') || file.name.match(/\.(mp4|webm|ogg|mp3|mov)$/i);

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

            // Check if it's an image (including iPhone formats)
            const isImageFile = file.type.includes('image') || file.name.match(/\.(heic|heif)$/i);
            if (isImageFile) {
                // Check if it's HEIC/HEIF format and convert if needed
                const isHEIC = blob.type.includes('heic') || blob.type.includes('heif') || file.name.match(/\.(heic|heif)$/i);

                if (isHEIC && typeof heic2any !== 'undefined') {
                    // Convert HEIC to JPEG
                    viewerBody.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Converting HEIC image...</p></div>';

                    heic2any({
                        blob: blob,
                        toType: 'image/jpeg',
                        quality: 0.9
                    })
                        .then(convertedBlob => {
                            const convertedUrl = URL.createObjectURL(convertedBlob);
                            const img = document.createElement('img');
                            img.style.maxWidth = '100%';
                            img.style.maxHeight = '100%';
                            img.style.display = 'block';

                            img.onload = () => {
                                console.log('HEIC image converted and loaded successfully!');
                                viewerBody.innerHTML = '';
                                viewerBody.appendChild(img);
                                
                                // Store converted blob for reuse in editor
                                currentViewedImageBlob = convertedBlob;
                                
                                // Add zoom functionality for HEIC images too
                                initializeImageZoom(img, viewerBody);
                            };

                            img.onerror = (e) => {
                                console.error('Converted image failed to load:', e);
                                viewerBody.innerHTML = `
                                <div class="empty-state">
                                    <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                                    <p style="color:red">Failed to display converted image</p>
                                    <p style="font-size: 0.85rem; color: #666;">Try downloading the file instead</p>
                                </div>`;
                            };

                            img.src = convertedUrl;
                        })
                        .catch(err => {
                            console.error('HEIC conversion failed:', err);
                            viewerBody.innerHTML = `
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                                <p style="color:red">Failed to convert HEIC image</p>
                                <p style="font-size: 0.85rem; color: #666;">${err.message || 'Conversion error'}</p>
                                <p style="font-size: 0.85rem; color: #666;">Try downloading the file instead</p>
                            </div>`;
                        });
                    return; // Exit early, conversion is async
                }

                // Regular image display
                const img = document.createElement('img');
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.display = 'block';

                img.onload = () => {
                    console.log('Image loaded successfully!');
                    viewerBody.innerHTML = '';
                    viewerBody.appendChild(img);
                    
                    // Store blob for reuse in editor
                    currentViewedImageBlob = blob;
                    
                    // Add zoom functionality
                    initializeImageZoom(img, viewerBody);

                    // Remove blur after a short delay to allow transition
                    // Since we replaced the body, the old blurred thumbnail is gone.
                    // But if we want to keep the transition effect, we should have appended the new image
                    // and then removed the old one.
                    // However, the simple approach of showing the new image is fine for now
                    // as the thumbnail was already shown as a placeholder.
                };

                img.onerror = (e) => {
                    console.error('Image failed to load:', e);
                    console.error('Image src:', img.src);
                    console.error('Blob type:', blob.type);
                    console.error('Blob size:', blob.size);

                    // Check if it's a HEIC/HEIF file
                    const isHEIC = file.name.match(/\.(heic|heif)$/i);
                    const errorMessage = isHEIC
                        ? 'HEIC/HEIF format not supported in browser. Please download the file or convert it to JPG/PNG.'
                        : 'Failed to display image';

                    viewerBody.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                            <p style="color:red">${errorMessage}</p>
                            <p style="font-size: 0.85rem; color: #666;">Blob size: ${blob.size} bytes</p>
                            <p style="font-size: 0.85rem; color: #666;">Try downloading the file instead</p>
                        </div>`;
                };

                // Set src LAST to ensure handlers are attached
                img.src = objectUrl;
            } else if (file.type === 'application/pdf') {
                // Decide when to force PDF.js
                const isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
                const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                const isDesktopOS = /Windows NT|Macintosh/.test(navigator.userAgent) && !/Mobile|Tablet/.test(navigator.userAgent);
                const isSmallViewport = window.innerWidth <= 1024; // catches desktop-mode mobile
                // Treat as mobile if true mobile UA, or touch + small viewport on non-desktop OS
                const isMobile = isMobileUA || (isTouch && isSmallViewport && !isDesktopOS);

                // Helper function for PDF fallback UI
                const showPDFFallback = (url, filename, shareUrl = null) => {
                    const buttons = [];
                    
                    // Add "View with Google" button if share URL is available
                    if (shareUrl) {
                        const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(shareUrl)}`;
                        buttons.push(`
                            <a href="${googleViewerUrl}" target="_blank" rel="noopener noreferrer"
                               class="primary-btn" style="display: inline-block; text-decoration: none; padding: 0.75rem 1.5rem; background: #4285f4;">
                                <i class="fab fa-google"></i> View with Google
                            </a>
                        `);
                    }
                    
                    buttons.push(`
                        <a href="${url}" download="${filename}" 
                           class="primary-btn" style="display: inline-block; text-decoration: none; padding: 0.75rem 1.5rem;">
                            <i class="fas fa-download"></i> Download PDF
                        </a>
                    `);
                    
                    buttons.push(`
                        <button onclick="window.open('${url}', '_blank')" 
                                class="primary-btn" style="padding: 0.75rem 1.5rem;">
                            <i class="fas fa-external-link-alt"></i> Open in Browser
                        </button>
                    `);
                    
                    viewerBody.innerHTML = `
                        <div class="empty-state" style="padding: 2rem; text-align: center;">
                            <i class="fas fa-file-pdf" style="font-size: 4rem; color: #ef4444; margin-bottom: 1rem;"></i>
                            <h3 style="margin-bottom: 0.5rem; color: var(--text-color);">${file.name}</h3>
                            <p style="margin-bottom: 1.5rem; color: var(--secondary-text); font-size: 0.875rem;">
                                ${isMobile ? 'PDF preview not available on this device' : 'Unable to display PDF inline'}
                            </p>
                            <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; padding: 0 1rem;">
                                ${buttons.join('')}
                            </div>
                        </div>`;
                };

                if (isMobile) {
                    // For mobile: Use PDF.js viewer for reliable PDF viewing
                    console.log('Using PDF.js viewer for mobile PDF viewing');
                    viewerBody.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading PDF...</p></div>';
                    
                    try {
                        // Initialize PDF viewer
                        if (window.PDFViewer) {
                            const pdfViewer = new window.PDFViewer();
                            pdfViewer.display(blob, viewerBody);
                        } else {
                            throw new Error('PDF Viewer library not loaded');
                        }
                    } catch (error) {
                        console.error('PDF.js viewer error:', error);
                        // Fallback to browser native viewer
                        console.log('Falling back to native PDF viewer');
                        const iframe = document.createElement('iframe');
                        iframe.src = objectUrl;
                        iframe.style.width = '100%';
                        iframe.style.height = '100%';
                        iframe.style.border = 'none';
                        viewerBody.innerHTML = '';
                        viewerBody.appendChild(iframe);
                        
                        // Add fallback button after timeout
                        setTimeout(() => {
                            const fallbackBtn = document.createElement('div');
                            fallbackBtn.style.position = 'absolute';
                            fallbackBtn.style.bottom = '10px';
                            fallbackBtn.style.left = '50%';
                            fallbackBtn.style.transform = 'translateX(-50%)';
                            fallbackBtn.style.zIndex = '10';
                            fallbackBtn.innerHTML = `
                                <div style="display: flex; gap: 0.5rem; background: rgba(0,0,0,0.8); padding: 0.5rem; border-radius: 8px;">
                                    <button onclick="window.open('${objectUrl}', '_blank')" class="primary-btn" style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                                        <i class="fas fa-external-link-alt"></i> Open
                                    </button>
                                    <a href="${objectUrl}" download="${file.name}" class="primary-btn" style="font-size: 0.875rem; padding: 0.5rem 1rem; text-decoration: none; display: inline-flex; align-items: center;">
                                        <i class="fas fa-download"></i> Download
                                    </a>
                                </div>`;
                            viewerBody.style.position = 'relative';
                            viewerBody.appendChild(fallbackBtn);
                        }, 1500);
                    }
                } else {
                    // Desktop: use native PDF viewer
                    const iframe = document.createElement('iframe');
                    iframe.src = objectUrl;
                    iframe.style.width = '100%';
                    iframe.style.height = '100%';
                    iframe.style.border = 'none';
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
                    pre.className = 'text-viewer';
                    pre.style.padding = '1rem';
                    pre.style.overflow = 'auto';
                    pre.style.height = '100%';
                    pre.style.width = '100%';
                    pre.style.whiteSpace = 'pre-wrap';
                    pre.textContent = text;
                    viewerBody.innerHTML = '';
                    viewerBody.appendChild(pre);
                });
            } else if (isMarkdown) {
                blob.text().then(text => {
                    const container = document.createElement('div');
                    container.className = 'markdown-viewer';
                    container.style.padding = '2rem';
                    container.style.overflow = 'auto';
                    container.style.height = '100%';
                    container.style.width = '100%';
                    
                    // Parse markdown to HTML
                    if (typeof marked !== 'undefined') {
                        marked.setOptions({
                            breaks: true,
                            gfm: true,
                            headerIds: true,
                            mangle: false
                        });
                        container.innerHTML = marked.parse(text);
                    } else {
                        // Fallback to plain text if marked is not loaded
                        const pre = document.createElement('pre');
                        pre.textContent = text;
                        container.appendChild(pre);
                    }
                    
                    viewerBody.innerHTML = '';
                    viewerBody.appendChild(container);
                });
            } else if (isCsv) {
                blob.text().then(text => {
                    const container = document.createElement('div');
                    container.style.cssText = 'padding: 1rem; overflow: auto; height: 100%; width: 100%;';
                    container.className = 'csv-container';
                    
                    // Parse CSV
                    const lines = text.split('\n').filter(line => line.trim());
                    if (lines.length === 0) {
                        container.innerHTML = '<div class="empty-state"><i class="fas fa-file-csv"></i><p>Empty CSV file</p></div>';
                        viewerBody.innerHTML = '';
                        viewerBody.appendChild(container);
                        return;
                    }
                    
                    // Create table
                    const table = document.createElement('table');
                    table.className = 'csv-table';
                    table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 0.9rem;';
                    
                    // Parse CSV with proper handling of quoted fields
                    const parseCSVLine = (line) => {
                        const result = [];
                        let current = '';
                        let inQuotes = false;
                        
                        for (let i = 0; i < line.length; i++) {
                            const char = line[i];
                            const nextChar = line[i + 1];
                            
                            if (char === '"') {
                                if (inQuotes && nextChar === '"') {
                                    current += '"';
                                    i++;
                                } else {
                                    inQuotes = !inQuotes;
                                }
                            } else if (char === ',' && !inQuotes) {
                                result.push(current);
                                current = '';
                            } else {
                                current += char;
                            }
                        }
                        result.push(current);
                        return result;
                    };
                    
                    // Header row
                    const thead = document.createElement('thead');
                    const headerRow = document.createElement('tr');
                    headerRow.className = 'csv-header-row';
                    
                    const headers = parseCSVLine(lines[0]);
                    headers.forEach(header => {
                        const th = document.createElement('th');
                        th.className = 'csv-header-cell';
                        th.style.cssText = 'padding: 0.75rem 1rem; text-align: left; font-weight: 600; white-space: nowrap;';
                        th.textContent = header.trim();
                        headerRow.appendChild(th);
                    });
                    thead.appendChild(headerRow);
                    table.appendChild(thead);
                    
                    // Body rows
                    const tbody = document.createElement('tbody');
                    for (let i = 1; i < lines.length; i++) {
                        const row = document.createElement('tr');
                        row.className = i % 2 === 0 ? 'csv-row csv-row-even' : 'csv-row csv-row-odd';
                        
                        const cells = parseCSVLine(lines[i]);
                        cells.forEach(cell => {
                            const td = document.createElement('td');
                            td.className = 'csv-cell';
                            td.style.cssText = 'padding: 0.75rem 1rem; white-space: nowrap;';
                            td.textContent = cell.trim();
                            row.appendChild(td);
                        });
                        tbody.appendChild(row);
                    }
                    table.appendChild(tbody);
                    
                    container.appendChild(table);
                    viewerBody.innerHTML = '';
                    viewerBody.appendChild(container);
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
                    // Microsoft Office Viewer cannot access localhost URLs
                    viewerBody.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-info-circle" style="color: #3b82f6; font-size: 2.5rem;"></i>
                            <h3 style="margin-top: 1rem; color: #1f2937; font-size: 1.1rem;">Document Preview (Localhost)</h3>
                            <p style="margin-top: 0.5rem; color: #6b7280; font-size: 0.9rem;">Microsoft Office Viewer requires a public URL.</p>
                            <p style="margin-top: 0.5rem; color: #6b7280; font-size: 0.8rem;">This will work automatically when deployed to Railway.</p>
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
                    // For Office documents on public server, use Microsoft Office Online Viewer
                    // It's more reliable than Google Docs Viewer for Office documents
                    viewerBody.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading document viewer...</p></div>';
                    generateTempShareLink(file, folderToUse)
                        .then(shareUrl => {
                            console.log('Generated share URL for document:', shareUrl);
                            
                            // Test if share URL is accessible
                            fetch(shareUrl, { method: 'HEAD' })
                                .then(resp => console.log('Share URL HEAD test:', resp.status, resp.headers.get('content-type')))
                                .catch(err => console.error('Share URL HEAD test failed:', err));
                            
                            // Use Microsoft Office Online Viewer (more reliable for Office docs)
                            const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(shareUrl)}`;
                            console.log('Office Viewer URL for document:', officeViewerUrl);
                            console.log('File type:', file.type);
                            console.log('File name:', file.name);

                            const iframe = document.createElement('iframe');
                            iframe.src = officeViewerUrl;
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            iframe.style.border = 'none';
                            iframe.setAttribute('frameborder', '0');
                            
                            // Add load event listener
                            iframe.onload = () => {
                                console.log('Iframe loaded successfully');
                            };

                            // Add error handler for iframe
                            iframe.onerror = (e) => {
                                console.error('Iframe failed to load:', e);
                                viewerBody.innerHTML = `
                                    <div class="empty-state">
                                        <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                                        <p>Failed to load document viewer</p>
                                        <p style="font-size: 0.85rem; color: #666; margin-top: 0.5rem;">Try opening the document directly</p>
                                        <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                                            <a href="${shareUrl}" target="_blank" class="primary-btn">
                                                <i class="fas fa-external-link-alt"></i> Open in New Tab
                                            </a>
                                            <a href="${objectUrl}" download="${file.name}" class="primary-btn">
                                                <i class="fas fa-download"></i> Download
                                            </a>
                                        </div>
                                    </div>`;
                            };

                            viewerBody.innerHTML = '';
                            viewerBody.appendChild(iframe);

                            // Add timeout fallback
                            setTimeout(() => {
                                if (viewerBody.querySelector('iframe') && viewerBody.querySelector('iframe').src === officeViewerUrl) {
                                    console.log('Adding fallback button for document viewer');
                                    // If Office Viewer fails silently, offer alternatives
                                    const fallbackDiv = document.createElement('div');
                                    fallbackDiv.style.position = 'absolute';
                                    fallbackDiv.style.bottom = '30px';
                                    fallbackDiv.style.right = '10px';
                                    fallbackDiv.innerHTML = `
                                        <a href="${shareUrl}" target="_blank" class="primary-btn" style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                                            <i class="fas fa-external-link-alt"></i> 
                                        </a>`;
                                    // Having trouble? Open in new tab
                                    viewerBody.style.position = 'relative';
                                    viewerBody.appendChild(fallbackDiv);
                                }
                            }, 3000);
                        })
                        .catch(err => {
                            console.error('Failed to generate share link for document:', err);
                            viewerBody.innerHTML = `
                                <div class="empty-state">
                                    <i class="fas fa-file-word"></i>
                                    <p>Failed to load document preview</p>
                                    <p style="font-size: 0.85rem; color: #666; margin-top: 0.5rem;">${err.message}</p>
                                    <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                                        <a href="${objectUrl}" download="${file.name}" class="primary-btn">
                                            <i class="fas fa-download"></i> Download
                                        </a>
                                        <button onclick="window.open('${objectUrl}', '_blank')" class="primary-btn" style="background: #10b981;">
                                            <i class="fas fa-external-link-alt"></i> Open
                                        </button>
                                    </div>
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
                                fallbackDiv.style.bottom = '30px';
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
    
    // Re-enable background scrolling
    document.body.style.overflow = '';
    
    // Reset and hide zoom controls
    const zoomControls = document.getElementById('zoomControls');
    if (zoomControls) {
        zoomControls.style.opacity = '0';
        setTimeout(() => {
            zoomControls.style.display = 'none';
        }, 300);
    }
    
    // Reset zoom state if exists
    if (window.viewerZoomState) {
        if (window.viewerZoomState.cleanup) {
            window.viewerZoomState.cleanup();
        }
        window.viewerZoomState = null;
    }

    if (updateUrl) {
        // Go back in history instead of replacing state
        // This allows users to skip the folder they were in when they opened the file
        history.back();
    }
}

closeViewerBtn.onclick = () => closeViewer(true);
viewerModal.onclick = (e) => {
    if (e.target === viewerModal) closeViewer(true);
};

// Navigation helpers for viewer modal
function updateNavigationButtons(currentFile) {
    const prevBtn = document.getElementById('prevFileBtn');
    const nextBtn = document.getElementById('nextFileBtn');
    
    if (!prevBtn || !nextBtn) return;
    
    // Only show navigation for files (not directories)
    const files = currentFiles.filter(item => !item.isDirectory);
    const currentIndex = files.findIndex(f => f.name === currentFile.name);
    
    if (currentIndex === -1 || files.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        return;
    }
    
    prevBtn.style.display = currentIndex > 0 ? 'block' : 'none';
    nextBtn.style.display = currentIndex < files.length - 1 ? 'block' : 'none';
}

function navigateFile(direction) {
    if (!currentViewedFile) return;
    
    const files = currentFiles.filter(item => !item.isDirectory);
    const currentIndex = files.findIndex(f => f.name === currentViewedFile.name);
    
    if (currentIndex === -1) return;
    
    let nextIndex;
    if (direction === 'prev') {
        nextIndex = currentIndex - 1;
    } else {
        nextIndex = currentIndex + 1;
    }
    
    if (nextIndex >= 0 && nextIndex < files.length) {
        const nextFile = files[nextIndex];
        
        // Clean up current viewer state before loading next file
        viewerBody.innerHTML = '';
        
        // Reset zoom state if exists
        if (window.viewerZoomState) {
            if (window.viewerZoomState.cleanup) {
                window.viewerZoomState.cleanup();
            }
            window.viewerZoomState = null;
        }
        
        // Hide zoom controls
        const zoomControls = document.getElementById('zoomControls');
        if (zoomControls) {
            zoomControls.style.display = 'none';
        }
        
        // Open next file - use replaceState instead of pushState to avoid stacking
        openViewer(nextFile, false, currentViewedFile.folder);
        
        // Manually replace the URL without adding to history stack
        const folderToUse = currentViewedFile.folder;
        const newUrl = `${window.location.pathname}?folder=${encodeURIComponent(folderToUse)}&file=${encodeURIComponent(nextFile.name)}`;
        history.replaceState({ folder: folderToUse, file: nextFile.name }, '', newUrl);
    }
}

// Navigation button event listeners
document.getElementById('prevFileBtn')?.addEventListener('click', () => navigateFile('prev'));
document.getElementById('nextFileBtn')?.addEventListener('click', () => navigateFile('next'));

// Properties Modal
const propertiesModal = document.getElementById('propertiesModal');
const closePropertiesModal = document.getElementById('closePropertiesModal');
const propertiesContent = document.getElementById('propertiesContent');

closePropertiesModal.onclick = () => propertiesModal.classList.add('hidden');
propertiesModal.onclick = (e) => {
    if (e.target === propertiesModal) propertiesModal.classList.add('hidden');
};

// Keyboard Shortcuts Modal handlers
closeShortcutsModal.onclick = () => shortcutsModal.classList.add('hidden');
shortcutsModal.onclick = (e) => {
    if (e.target === shortcutsModal) shortcutsModal.classList.add('hidden');
};

async function showPropertiesModal(encodedPath, encodedName, isDirectory) {
    const itemPath = decodeURIComponent(encodedPath);
    const itemName = decodeURIComponent(encodedName);
    
    propertiesModal.classList.remove('hidden');
    propertiesContent.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading properties...</p></div>';
    
    try {
        // Construct the full path including 'uploads/' prefix
        const fullPath = `uploads/${itemPath}`;
        
        // Fetch detailed file/folder metadata from GitHub API
        const response = await fetch(`${API_BASE}/github/metadata?owner=${ghUser}&repo=${ghRepo}&branch=${ghBranch}&path=${encodeURIComponent(fullPath)}`, {
            headers: { 'Authorization': `Bearer ${ghToken}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch metadata');
        }
        
        const metadata = await response.json();
        
        // Build properties HTML
        let propertiesHTML = '<div class="properties-grid">';
        
        // Basic info
        propertiesHTML += `
            <div class="property-row">
                <div class="property-label"><i class="fas fa-tag"></i> Name</div>
                <div class="property-value">${itemName}</div>
            </div>
            <div class="property-row">
                <div class="property-label"><i class="fas fa-${isDirectory ? 'folder' : 'file'}"></i> Type</div>
                <div class="property-value">${isDirectory ? 'Folder' : (metadata.type || 'File')}</div>
            </div>
        `;
        
        if (!isDirectory) {
            propertiesHTML += `
                <div class="property-row">
                    <div class="property-label"><i class="fas fa-weight-hanging"></i> Size</div>
                    <div class="property-value">${formatSize(metadata.size)} (${metadata.size.toLocaleString()} bytes)</div>
                </div>
            `;
            
            if (metadata.sha) {
                propertiesHTML += `
                    <div class="property-row">
                        <div class="property-label"><i class="fas fa-fingerprint"></i> SHA Hash</div>
                        <div class="property-value" style="font-family: monospace; word-break: break-all; font-size: 0.85rem;">${metadata.sha}</div>
                    </div>
                `;
            }
            
            if (metadata.encoding) {
                propertiesHTML += `
                    <div class="property-row">
                        <div class="property-label"><i class="fas fa-code"></i> Encoding</div>
                        <div class="property-value">${metadata.encoding}</div>
                    </div>
                `;
            }
        }
        
        propertiesHTML += `
            <div class="property-row">
                <div class="property-label"><i class="fas fa-map-marker-alt"></i> Path</div>
                <div class="property-value" style="word-break: break-all; font-family: monospace; font-size: 0.85rem;">${itemPath}</div>
            </div>
        `;
        
        if (metadata.download_url && !isDirectory) {
            propertiesHTML += `
                <div class="property-row">
                    <div class="property-label"><i class="fas fa-link"></i> Direct URL</div>
                    <div class="property-value"><a href="${metadata.download_url}" target="_blank" style="color: var(--primary-color); text-decoration: none;">View on GitHub <i class="fas fa-external-link-alt"></i></a></div>
                </div>
            `;
        }
        
        // Git metadata
        if (metadata.git_url) {
            propertiesHTML += `
                <div class="property-section-title"><i class="fas fa-code-branch"></i> Git Information</div>
                <div class="property-row">
                    <div class="property-label"><i class="fas fa-code-branch"></i> Git URL</div>
                    <div class="property-value" style="word-break: break-all; font-size: 0.85rem;">${metadata.git_url}</div>
                </div>
            `;
        }
        
        if (metadata.html_url) {
            propertiesHTML += `
                <div class="property-row">
                    <div class="property-label"><i class="fab fa-github"></i> GitHub Page</div>
                    <div class="property-value"><a href="${metadata.html_url}" target="_blank" style="color: var(--primary-color); text-decoration: none;">View on GitHub <i class="fas fa-external-link-alt"></i></a></div>
                </div>
            `;
        }
        
        // Commit info if available
        if (metadata.lastCommit) {
            propertiesHTML += `
                <div class="property-section-title"><i class="fas fa-history"></i> Last Modified</div>
                <div class="property-row">
                    <div class="property-label"><i class="fas fa-clock"></i> Date</div>
                    <div class="property-value">${new Date(metadata.lastCommit.date).toLocaleString()}</div>
                </div>
                <div class="property-row">
                    <div class="property-label"><i class="fas fa-user"></i> Author</div>
                    <div class="property-value">${metadata.lastCommit.author || 'Unknown'}</div>
                </div>
                <div class="property-row">
                    <div class="property-label"><i class="fas fa-comment"></i> Commit Message</div>
                    <div class="property-value" style="font-style: italic;">${metadata.lastCommit.message || 'No message'}</div>
                </div>
            `;
        }
        
        propertiesHTML += '</div>';
        
        propertiesContent.innerHTML = propertiesHTML;
        
    } catch (error) {
        console.error('Failed to load properties:', error);
        propertiesContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <p style="color: #ef4444;">Failed to load properties</p>
                <p style="font-size: 0.85rem; color: #666; margin-top: 0.5rem;">${error.message}</p>
            </div>
        `;
    }
}

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

    console.log('Creating share link for:', filePath);

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
        const errorText = await res.text();
        console.error('Share link creation failed:', res.status, errorText);
        throw new Error(`Failed to create share link: ${res.status}`);
    }

    const data = await res.json();
    const shareUrl = data.url + '/download';
    console.log('Share link created successfully:', shareUrl);
    
    // Return the download URL (without download=true parameter for inline viewing)
    return shareUrl;
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

// Select range of files between two indices (for Shift+Click)
function selectRange(startIndex, endIndex, clickedItemName) {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    
    const fileCards = document.querySelectorAll('.file-card');
    
    // Determine if we should select or deselect based on the clicked item's current state
    const shouldSelect = !selectedFiles.has(clickedItemName);
    
    for (let i = start; i <= end; i++) {
        if (i < fileCards.length) {
            const card = fileCards[i];
            const itemName = card.dataset.itemName;
            
            if (shouldSelect) {
                selectedFiles.add(itemName);
            } else {
                selectedFiles.delete(itemName);
            }
        }
    }
    
    lastClickedIndex = endIndex;
    console.log(`Range ${shouldSelect ? 'selected' : 'deselected'}:`, start, 'to', end);
    console.log('Selected files:', Array.from(selectedFiles));
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
    lastClickedIndex = -1; // Reset range selection
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
        // Process all deletes in parallel for speed
        const deletePromises = items.map(itemName => {
            const item = currentFiles.find(f => f.name === itemName);
            if (item) {
                return deleteItemAPI(itemName, item.isDirectory, 5, true) // Skip individual processing indicators
                    .then(success => {
                        if (success) successCount++;
                        return success;
                    });
            }
            return Promise.resolve(false);
        });

        await Promise.all(deletePromises);

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

document.getElementById('bulkDownloadBtn')?.addEventListener('click', async () => {
    if (selectedFiles.size === 0) return;

    const items = Array.from(selectedFiles);
    showProcessing(`Preparing ${items.length} file(s) for download...`);

    try {
        const zip = new JSZip();
        let downloadCount = 0;
        let downloadedBytes = 0;

        // Download files in parallel with concurrency limit
        const downloadPromises = items.map(async (itemName) => {
            const item = currentFiles.find(f => f.name === itemName);
            if (!item) return;

            if (item.isDirectory) {
                // For directories, recursively fetch all files
                const fullPath = currentFolder ? `${currentFolder}/${itemName}` : itemName;
                await addDirectoryToZip(zip, fullPath, itemName, (bytes) => {
                    downloadedBytes += bytes;
                    downloadCount++;
                    showProcessing(`Downloading... ${downloadCount}/${items.length} files (${formatSize(downloadedBytes)})`);
                });
            } else {
                // For files, fetch and add to zip
                try {
                    const itemPath = currentFolder ? `${currentFolder}/${itemName}` : itemName;
                    const response = await fetch(`${API_BASE}/github/view?owner=${ghUser}&repo=${ghRepo}&branch=${ghBranch}&path=${encodeURIComponent(itemPath)}`, {
                        headers: { 'Authorization': `Bearer ${ghToken}` }
                    });

                    if (response.ok) {
                        const blob = await response.blob();
                        zip.file(itemName, blob);
                        downloadCount++;
                        downloadedBytes += blob.size;
                        // showProcessing(`Downloading... ${downloadCount} files (${formatSize(downloadedBytes)})`);
                        showProcessing(`Downloading... ${downloadCount}/${items.length} files (${formatSize(downloadedBytes)})`);
                    }
                } catch (error) {
                    console.error(`Failed to download ${itemName}:`, error);
                }
            }
        });

        await Promise.all(downloadPromises);

        if (downloadCount === 0) {
            alert('No files could be downloaded');
            return;
        }

        // Generate zip with minimal compression for speed
        showProcessing(`Creating zip file (${downloadCount} files)...`);
        const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 } // Fast compression (1(fast)-6(default)-9(slowest))
        });
        
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(zipBlob);
        const timestamp = new Date().toISOString().slice(0, 10);
        downloadLink.download = `files_${timestamp}.zip`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(downloadLink.href);

    } catch (error) {
        console.error('Bulk download error:', error);
        alert('Failed to create download: ' + error.message);
    } finally {
        hideProcessing();
    }
});

// Helper function to recursively add directory contents to zip
async function addDirectoryToZip(zip, folderPath, zipPath, progressCallback) {
    try {
        const response = await fetch(`${API_BASE}/github/files?owner=${ghUser}&repo=${ghRepo}&branch=${ghBranch}&path=${encodeURIComponent(folderPath)}`, {
            headers: { 'Authorization': `Bearer ${ghToken}` }
        });

        if (!response.ok) return;

        const data = await response.json();
        const folder = zip.folder(zipPath);

        // Download files in parallel for better performance
        const filePromises = data.files.map(async (item) => {
            if (item.isDirectory) {
                await addDirectoryToZip(zip, `${folderPath}/${item.name}`, `${zipPath}/${item.name}`, progressCallback);
            } else {
                try {
                    const fileResponse = await fetch(`${API_BASE}/github/view?owner=${ghUser}&repo=${ghRepo}&branch=${ghBranch}&path=${encodeURIComponent(`${folderPath}/${item.name}`)}`, {
                        headers: { 'Authorization': `Bearer ${ghToken}` }
                    });

                    if (fileResponse.ok) {
                        const blob = await fileResponse.blob();
                        folder.file(item.name, blob);
                        if (progressCallback) progressCallback(blob.size);
                    }
                } catch (error) {
                    console.error(`Failed to download ${item.name}:`, error);
                }
            }
        });

        await Promise.all(filePromises);
    } catch (error) {
        console.error(`Failed to add directory ${folderPath}:`, error);
    }
}

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

async function deleteItemAPI(itemName, isDirectory, retries = 5, skipProcessingIndicator = false) {
    if (!skipProcessingIndicator) {
        showProcessing(`Deleting ${isDirectory ? 'folder' : 'file'}...`);
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
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
                if (!skipProcessingIndicator) {
                    hideProcessing();
                }
                return true;
            } else {
                console.warn(`Attempt ${attempt}/${retries} failed for delete ${itemName} (Status: ${res.status})`);

                if (attempt < retries) {
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    console.log(`Retrying delete in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    if (!skipProcessingIndicator) {
                        hideProcessing();
                        alert('Failed to delete after multiple attempts');
                    }
                    return false;
                }
            }
        } catch (err) {
            console.error(`Delete attempt ${attempt}/${retries} failed:`, err);

            if (attempt < retries) {
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`Network error. Retrying delete in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                if (!skipProcessingIndicator) {
                    hideProcessing();
                    alert('Error deleting item - network issue');
                }
                return false;
            }
        }
    }

    if (!skipProcessingIndicator) {
        hideProcessing();
    }
    return false;
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

    const retries = 5;
    for (let attempt = 1; attempt <= retries; attempt++) {
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
                hideProcessing();
                await loadFiles(currentFolder);
                return;
            } else {
                console.warn(`Attempt ${attempt}/${retries} failed for rename ${itemName} (Status: ${res.status})`);

                if (attempt < retries) {
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    console.log(`Retrying rename in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    hideProcessing();
                    alert('Failed to rename after multiple attempts');
                    return;
                }
            }
        } catch (err) {
            console.error(`Rename attempt ${attempt}/${retries} failed:`, err);

            if (attempt < retries) {
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`Network error. Retrying rename in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                hideProcessing();
                alert('Error renaming item - network issue');
                return;
            }
        }
    }

    hideProcessing();
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
                    // Process all moves in parallel for speed
                    const movePromises = items.map(item =>
                        moveOrCopyItem(item.name, targetPath, 'move', item.isDirectory, 5, true) // Skip individual processing indicators
                            .then(success => {
                                if (success) successCount++;
                                return success;
                            })
                    );

                    await Promise.all(movePromises);

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
                    // Process all moves in parallel for speed
                    const movePromises = items.map(item =>
                        moveOrCopyItem(item.name, targetFolderPath, 'move', item.isDirectory, 5, true) // Skip individual processing indicators
                            .then(success => {
                                if (success) successCount++;
                                return success;
                            })
                    );

                    await Promise.all(movePromises);

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
let selectedDestFolders = new Set(); // Changed to Set for multiple selection

async function showFolderSelectionModal(operation) {
    folderSelectionOperation = operation;
    selectedDestFolders.clear(); // Clear previous selections
    const title = document.getElementById('folderSelectionTitle');
    title.textContent = `Select Destination Folders (${operation === 'move' ? 'Move' : 'Copy'})`;

    // Show modal immediately with loading state
    folderSelectionModal.classList.remove('hidden');

    // Show loading indicator
    const folderTree = document.getElementById('folderTree');
    folderTree.innerHTML = '<div style="padding: 2rem; text-align: center;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i><p style="margin-top: 1rem; color: #6b7280;">Loading folders...</p></div>';

    // Update counter
    updateSelectedFoldersCount();

    // Load all folders asynchronously
    await renderFolderTree();
}

async function renderFolderTree() {
    const folderTree = document.getElementById('folderTree');
    folderTree.innerHTML = '';

    try {
        // Add Home folder
        const homeDiv = document.createElement('div');
        homeDiv.className = 'folder-tree-item';
        homeDiv.style.display = 'flex';
        homeDiv.style.alignItems = 'center';
        homeDiv.style.gap = '0.5rem';
        homeDiv.style.padding = '0.5rem';
        homeDiv.style.cursor = 'pointer';
        homeDiv.dataset.folder = '';

        const homeCheckbox = document.createElement('input');
        homeCheckbox.type = 'checkbox';
        homeCheckbox.style.cursor = 'pointer';
        homeCheckbox.onclick = (e) => {
            e.stopPropagation();
            toggleDestFolder('');
        };

        const homeLabel = document.createElement('span');
        homeLabel.innerHTML = '<i class="fas fa-home"></i> Home';
        homeLabel.style.flex = '1';

        homeDiv.appendChild(homeCheckbox);
        homeDiv.appendChild(homeLabel);
        homeDiv.onclick = () => toggleDestFolder('');

        // Disable if current folder is home
        if (currentFolder === '') {
            homeDiv.style.opacity = '0.5';
            homeDiv.style.cursor = 'not-allowed';
            homeDiv.style.pointerEvents = 'none';
            homeCheckbox.disabled = true;
            homeDiv.title = 'Cannot move/copy to current folder';
        }

        folderTree.appendChild(homeDiv);

        // Get all folders recursively
        const folders = await fetchAllFolders();
        folders.forEach(folder => {
            const indent = folder.split('/').length - 1;
            const div = document.createElement('div');
            div.className = 'folder-tree-item';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '0.5rem';
            div.style.paddingLeft = `${indent + 1}rem`;
            div.style.padding = '0.5rem';
            div.style.cursor = 'pointer';
            div.dataset.folder = folder;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.cursor = 'pointer';
            checkbox.onclick = (e) => {
                e.stopPropagation();
                toggleDestFolder(folder);
            };

            const label = document.createElement('span');
            label.innerHTML = `<i class="fas fa-folder"></i> ${folder.split('/').pop()}`;
            label.style.flex = '1';

            div.appendChild(checkbox);
            div.appendChild(label);
            div.onclick = () => toggleDestFolder(folder);

            // Disable if it's the current folder
            if (folder === currentFolder) {
                div.style.opacity = '0.5';
                div.style.cursor = 'not-allowed';
                div.style.pointerEvents = 'none';
                checkbox.disabled = true;
                div.title = 'Cannot move/copy to current folder';
            }

            folderTree.appendChild(div);
        });
    } catch (err) {
        console.error('Error loading folders:', err);
        folderTree.innerHTML = '<div style="padding: 1rem; text-align: center; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load folders</div>';
    }
}

function toggleDestFolder(folder) {
    if (selectedDestFolders.has(folder)) {
        selectedDestFolders.delete(folder);
    } else {
        selectedDestFolders.add(folder);
    }

    // Update checkboxes
    document.querySelectorAll('.folder-tree-item').forEach(el => {
        const elFolder = el.dataset.folder;
        const checkbox = el.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.disabled) {
            checkbox.checked = selectedDestFolders.has(elFolder);
        }

        // Highlight selected folders
        if (selectedDestFolders.has(elFolder)) {
            el.style.background = 'var(--hover-bg)';
        } else {
            el.style.background = '';
        }
    });

    updateSelectedFoldersCount();
}

function updateSelectedFoldersCount() {
    const countSpan = document.getElementById('selectedFoldersCount');
    if (countSpan) {
        const count = selectedDestFolders.size;
        countSpan.textContent = `${count} folder${count !== 1 ? 's' : ''} selected`;
    }
}

async function fetchAllFolders(path = '') {
    try {
        const items = await fetchGitHubFiles(path);
        const folders = [];

        // Collect all immediate subfolders
        const subfolderPaths = [];
        for (const item of items) {
            if (item.isDirectory) {
                const folderPath = path ? `${path}/${item.name}` : item.name;
                folders.push(folderPath);
                subfolderPaths.push(folderPath);
            }
        }

        // Fetch all subfolders in parallel for better performance
        if (subfolderPaths.length > 0) {
            const subfolderPromises = subfolderPaths.map(folderPath => fetchAllFolders(folderPath));
            const subfolderResults = await Promise.all(subfolderPromises);

            // Flatten and add all nested folders
            subfolderResults.forEach(subFolders => {
                folders.push(...subFolders);
            });
        }

        return folders;
    } catch (err) {
        console.error('Error fetching folders:', err);
        return [];
    }
}

closeFolderSelectionModal?.addEventListener('click', () => {
    folderSelectionModal.classList.add('hidden');
    selectedDestFolders.clear();
});

cancelFolderSelection?.addEventListener('click', () => {
    folderSelectionModal.classList.add('hidden');
    selectedDestFolders.clear();
});

confirmFolderSelection?.addEventListener('click', async () => {
    if (selectedDestFolders.size === 0) {
        alert('Please select at least one destination folder');
        return;
    }

    folderSelectionModal.classList.add('hidden');

    const items = Array.from(selectedFiles);
    const destFolders = Array.from(selectedDestFolders);
    const totalOperations = items.length * destFolders.length;
    let successCount = 0;

    showProcessing(`${folderSelectionOperation === 'move' ? 'Moving' : 'Copying'} ${items.length} item(s) to ${destFolders.length} folder(s)...`);

    try {
        // Process all operations in parallel for speed
        const operations = [];

        for (const destFolder of destFolders) {
            for (const itemName of items) {
                const item = currentFiles.find(f => f.name === itemName);
                if (item) {
                    operations.push(
                        moveOrCopyItem(itemName, destFolder, folderSelectionOperation, item.isDirectory, 5, true) // Skip individual processing indicators
                            .then(success => {
                                if (success) successCount++;
                                return success;
                            })
                    );
                }
            }
        }

        // Wait for all operations to complete
        await Promise.all(operations);

        alert(`${folderSelectionOperation === 'move' ? 'Moved' : 'Copied'} ${successCount} of ${totalOperations} item(s) successfully`);
    } finally {
        hideProcessing();
        selectedFiles.clear();
        updateBulkActionsBar();
        await loadFiles(currentFolder);
        selectedDestFolders.clear();
    }
});

async function moveOrCopyItem(itemName, destFolder, operation, isDirectory, retries = 5, skipProcessingIndicator = false) {
    if (!skipProcessingIndicator) {
        showProcessing(`${operation === 'move' ? 'Moving' : 'Copying'} ${isDirectory ? 'folder' : 'file'}...`);
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
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
                if (!skipProcessingIndicator) {
                    hideProcessing();
                }
                return true;
            } else {
                // If it's not a network error (4xx, 5xx), retry
                const statusCode = res.status;
                console.warn(`Attempt ${attempt}/${retries} failed for ${operation} ${itemName} (Status: ${statusCode})`);

                if (attempt < retries) {
                    // Exponential backoff: wait 1s, 2s, 4s, 8s
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    console.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error(`Failed to ${operation} ${itemName} after ${retries} attempts`);
                    if (!skipProcessingIndicator) {
                        hideProcessing();
                    }
                    return false;
                }
            }
        } catch (err) {
            // Network error or exception
            console.error(`Attempt ${attempt}/${retries} failed with error:`, err);

            if (attempt < retries) {
                // Exponential backoff: wait 1s, 2s, 4s, 8s
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`Network error. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`Failed to ${operation} ${itemName} after ${retries} attempts due to network error`);
                if (!skipProcessingIndicator) {
                    hideProcessing();
                }
                return false;
            }
        }
    }

    if (!skipProcessingIndicator) {
        hideProcessing();
    }
    return false;
}

init();

// Initialize Image Editor after DOM is ready
initializeImageEditor();

// Logout button event listener
document.getElementById('logoutBtn')?.addEventListener('click', logout);

// --- Image Zoom Functionality with Cropper.js ---
function initializeImageZoom(img, container) {
    // Destroy existing cropper if any
    if (viewerCropper) {
        viewerCropper.destroy();
        viewerCropper = null;
    }
    
    // Show zoom controls
    const zoomControls = document.getElementById('zoomControls');
    const zoomLevel = document.getElementById('zoomLevel');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');
    
    if (zoomControls) {
        zoomControls.style.display = 'flex';
        setTimeout(() => {
            zoomControls.style.opacity = '1';
        }, 100);
    }
    
    // Initialize Cropper.js for zoom and pan (no crop mode)
    viewerCropper = new Cropper(img, {
        viewMode: 1,
        dragMode: 'move',
        aspectRatio: NaN,
        autoCropArea: 0,
        autoCrop: false,
        zoomable: true,
        zoomOnWheel: true,
        zoomOnTouch: true,
        cropBoxMovable: false,
        cropBoxResizable: false,
        toggleDragModeOnDblclick: false,
        background: false,
        guides: false,
        center: false,
        highlight: false,
        movable: true,
        rotatable: false,
        scalable: false,
        responsive: true,
        restore: false,
        checkCrossOrigin: false,
        checkOrientation: false,
        modal: false,
        minContainerWidth: 200,
        minContainerHeight: 200,
        ready() {
            updateZoomLevel();
        },
        zoom(event) {
            updateZoomLevel();
        }
    });
    
    function updateZoomLevel() {
        if (viewerCropper && zoomLevel) {
            const imageData = viewerCropper.getImageData();
            const scale = imageData.width / imageData.naturalWidth;
            zoomLevel.textContent = Math.round(scale * 100) + '%';
        }
    }
    
    function resetZoom() {
        if (viewerCropper) {
            viewerCropper.reset();
            updateZoomLevel();
        }
    }
    
    // Zoom button handlers
    if (zoomInBtn) {
        zoomInBtn.onclick = (e) => {
            e.stopPropagation();
            if (viewerCropper) {
                viewerCropper.zoom(0.1);
            }
        };
    }
    
    if (zoomOutBtn) {
        zoomOutBtn.onclick = (e) => {
            e.stopPropagation();
            if (viewerCropper) {
                viewerCropper.zoom(-0.1);
            }
        };
    }
    
    if (zoomResetBtn) {
        zoomResetBtn.onclick = (e) => {
            e.stopPropagation();
            resetZoom();
        };
    }
    
    // Double-click to reset zoom
    img.addEventListener('dblclick', resetZoom);
    
    // Store zoom state
    window.viewerZoomState = {
        reset: resetZoom,
        scale: () => {
            if (viewerCropper) {
                const imageData = viewerCropper.getImageData();
                return imageData.width / imageData.naturalWidth;
            }
            return 1;
        },
        cleanup: () => {
            if (viewerCropper) {
                viewerCropper.destroy();
                viewerCropper = null;
            }
            if (zoomControls) {
                zoomControls.style.display = 'none';
            }
        }
    };
}

// --- Image Editor Functions ---

// Initialize Image Editor when DOM is ready
function initializeImageEditor() {
    if (window.ImageEditor) {
        imageEditor = new ImageEditor();
        imageEditor.configure({
            apiBase: API_BASE,
            ghToken: ghToken,
            ghUser: ghUser,
            ghRepo: ghRepo,
            ghBranch: ghBranch,
            currentFolder: currentFolder
        });

        // Set up edit button click handler
        const editImageBtn = document.getElementById('editImageBtn');
        if (editImageBtn) {
            editImageBtn.addEventListener('click', () => {
                if (currentViewedFile) {
                    // Show loading indicator immediately
                    const originalHTML = editImageBtn.innerHTML;
                    editImageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    editImageBtn.disabled = true;
                    
                    // Small delay to ensure UI updates
                    setTimeout(() => {
                        try {
                            // Update config with current folder before opening
                            imageEditor.configure({ currentFolder: currentFolder });
                            // Pass the already-loaded image blob to avoid re-fetching
                            imageEditor.open(currentViewedFile, currentViewedImageBlob);
                        } finally {
                            // Restore button state
                            editImageBtn.innerHTML = originalHTML;
                            editImageBtn.disabled = false;
                        }
                    }, 50);
                }
            });
        }
    }
}

// Text Editor Functionality
let currentEditingFile = null;
let currentEditingFileContent = null;

const textEditorModal = document.getElementById('textEditorModal');
const textEditorContent = document.getElementById('textEditorContent');
const commitMessage = document.getElementById('commitMessage');
const saveTextBtn = document.getElementById('saveTextBtn');
const closeTextEditorBtn = document.getElementById('closeTextEditorBtn');

// Open text editor
if (editTextBtn) {
    editTextBtn.addEventListener('click', async () => {
        try {
            // Get current file info
            currentEditingFile = currentViewedFile;
            
            // Fetch file content
            const filePath = currentFolder ? `${currentFolder}/${currentEditingFile.name}` : currentEditingFile.name;
            const fileUrl = `${API_BASE}/github/view?owner=${ghUser}&repo=${ghRepo}&branch=${ghBranch}&path=${encodeURIComponent(filePath)}`;
            
            showProcessing('Loading file...');
            const response = await fetch(fileUrl, {
                headers: { 'Authorization': `Bearer ${ghToken}` }
            });
            if (!response.ok) throw new Error('Failed to load file');
            
            const blob = await response.blob();
            const text = await blob.text();
            currentEditingFileContent = text;
            
            // Populate editor
            textEditorContent.value = text;
            commitMessage.value = `Update ${currentEditingFile.name}`;
            
            // Show editor modal
            textEditorModal.classList.remove('hidden');
            hideProcessing();
            
            // Focus on textarea
            textEditorContent.focus();
        } catch (error) {
            console.error('Error opening text editor:', error);
            hideProcessing();
            alert('Failed to open editor: ' + error.message);
        }
    });
}

// Save text changes
if (saveTextBtn) {
    saveTextBtn.addEventListener('click', async () => {
        if (!commitMessage.value.trim()) {
            alert('Please enter a commit message');
            commitMessage.focus();
            return;
        }
        
        try {
            const newContent = textEditorContent.value;
            
            // Create form data
            const formData = new FormData();
            const blob = new Blob([newContent], { type: 'text/plain' });
            formData.append('file', blob, currentEditingFile.name);
            formData.append('folder', currentFolder || '');
            formData.append('commitMessage', commitMessage.value);
            
            showProcessing('Saving changes...');
            
            const response = await fetch(`${API_BASE}/github/update`, {
                method: 'POST',
                headers: {
                    'x-gh-token': ghToken,
                    'x-gh-user': ghUser,
                    'x-gh-repo': ghRepo,
                    'x-gh-branch': ghBranch
                },
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save changes');
            }
            
            hideProcessing();
            alert('File saved successfully!');
            
            // Close editor and refresh viewer
            textEditorModal.classList.add('hidden');
            
            // Reload the file in viewer
            openViewer(currentEditingFile, false, currentFolder);
            
            // Refresh file list
            loadFiles(currentFolder);
        } catch (error) {
            console.error('Error saving file:', error);
            hideProcessing();
            alert('Failed to save file: ' + error.message);
        }
    });
}

// Close text editor
if (closeTextEditorBtn) {
    closeTextEditorBtn.addEventListener('click', () => {
        if (textEditorContent.value !== currentEditingFileContent) {
            if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
                return;
            }
        }
        textEditorModal.classList.add('hidden');
    });
}

// Close text editor on background click
if (textEditorModal) {
    textEditorModal.addEventListener('click', (e) => {
        if (e.target === textEditorModal) {
            if (textEditorContent.value !== currentEditingFileContent) {
                if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
                    return;
                }
            }
            textEditorModal.classList.add('hidden');
        }
    });
}

// Global Keyboard Shortcuts - Use capture phase to intercept before browser
// Extra guard: intercept Alt+N for new folder
window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.code === 'KeyN' || e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const createFolderBtn = document.getElementById('createFolderBtn');
        if (createFolderBtn) {
            createFolderBtn.click();
        }
    }
}, true);

window.addEventListener('keydown', (e) => {
    // Check if user is typing in a text input field (exclude checkboxes, buttons, etc.)
    const isTextInput = (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'password' || e.target.type === 'email' || e.target.type === 'search' || e.target.type === 'url' || e.target.type === 'tel' || e.target.type === 'number')) 
                        || e.target.tagName === 'TEXTAREA' 
                        || e.target.isContentEditable;
    
    // ALT+N: Create new folder
    if (e.altKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) {
        if (!isTextInput) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const createFolderBtn = document.getElementById('createFolderBtn');
            if (createFolderBtn) {
                createFolderBtn.click();
            }
        } else {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
        return false;
    }
    
    // DEL: Trigger delete button (works even on checkboxes/buttons)
    if ((e.key === 'Delete' || e.code === 'Delete')) {
        if (selectedFiles && selectedFiles.size > 0 && !isTextInput) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
            if (bulkDeleteBtn) {
                bulkDeleteBtn.click();
            }
        }
        return;
    }
    
    // ?: Show keyboard shortcuts panel
    if ((e.key === '?' || e.key === '/' && e.shiftKey) && !isTextInput) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (shortcutsModal) {
            shortcutsModal.classList.remove('hidden');
        }
        return;
    }
    
    // ESC: Close modals or deselect files
    if (e.key === 'Escape') {
        // Check if viewer modal is open
        if (viewerModal && !viewerModal.classList.contains('hidden')) {
            closeViewer();
            return;
        }
        
        // Check if share modal is open
        if (shareModal && !shareModal.classList.contains('hidden')) {
            shareModal.classList.add('hidden');
            return;
        }
        
        // Check if shortcuts modal is open
        if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) {
            shortcutsModal.classList.add('hidden');
            return;
        }
        
        // Check if properties modal is open
        if (propertiesModal && !propertiesModal.classList.contains('hidden')) {
            propertiesModal.classList.add('hidden');
            return;
        }
        
        // Check if folder selection modal is open
        const folderSelectionModal = document.getElementById('folderSelectionModal');
        if (folderSelectionModal && !folderSelectionModal.classList.contains('hidden')) {
            folderSelectionModal.classList.add('hidden');
            return;
        }
        
        // Deselect all files if any are selected
        if (selectedFiles && selectedFiles.size > 0) {
            const deselectAllBtn = document.getElementById('deselectAllBtn');
            if (deselectAllBtn) {
                deselectAllBtn.click();
            }
            return;
        }
    }
    
    // Arrow keys: Navigate between files in viewer modal
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isTextInput) {
        // Check if viewer modal is open
        if (viewerModal && !viewerModal.classList.contains('hidden') && currentViewedFile) {
            e.preventDefault();
            if (e.key === 'ArrowLeft') {
                navigateFile('prev');
            } else if (e.key === 'ArrowRight') {
                navigateFile('next');
            }
            return;
        }
    }
    
    // CTRL+U: Trigger upload
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        if (!isTextInput) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const uploadBtn = document.getElementById('uploadBtn');
            if (uploadBtn) {
                uploadBtn.click();
            }
        }
        return false;
    }
    
    // CTRL+L: Turn off dark mode (light mode)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        if (!isTextInput) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const darkModeToggle = document.getElementById('darkModeToggle');
            if (darkModeToggle) {
                darkModeToggle.checked = false;
                darkModeToggle.dispatchEvent(new Event('change'));
            }
        }
        return false;
    }
    
    // CTRL+D: Turn on dark mode
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (!isTextInput) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const darkModeToggle = document.getElementById('darkModeToggle');
            if (darkModeToggle) {
                darkModeToggle.checked = true;
                darkModeToggle.dispatchEvent(new Event('change'));
            }
        }
        return false;
    }
}, true); // true = capture phase

// ====== LOCKED FOLDER FUNCTIONALITY ======

// Track unlocked folders in current session
const unlockedFolders = new Set();

// Get elements for locked folder modal
const lockedFolderModal = document.getElementById('lockedFolderModal');
const closeLockedFolderModal = document.getElementById('closeLockedFolderModal');
const lockFolderForm = document.getElementById('lockFolderForm');
const unlockFolderForm = document.getElementById('unlockFolderForm');
const lockedFolderAction = document.getElementById('lockedFolderAction');
const lockFolderPassword = document.getElementById('lockFolderPassword');
const lockFolderPasswordConfirm = document.getElementById('lockFolderPasswordConfirm');
const unlockFolderPassword = document.getElementById('unlockFolderPassword');
const unlockError = document.getElementById('unlockError');
const confirmLockBtn = document.getElementById('confirmLockBtn');
const confirmUnlockBtn = document.getElementById('confirmUnlockBtn');
const removeLockBtn = document.getElementById('removeLockBtn');

let currentLockFolderPath = null; // Track folder being locked/unlocked

// Close locked folder modal
if (closeLockedFolderModal) {
    closeLockedFolderModal.onclick = () => {
        lockedFolderModal.classList.add('hidden');
        resetLockedFolderModal();
    };
}

// Close on outside click
if (lockedFolderModal) {
    lockedFolderModal.onclick = (e) => {
        if (e.target === lockedFolderModal) {
            lockedFolderModal.classList.add('hidden');
            resetLockedFolderModal();
        }
    };
}

function resetLockedFolderModal() {
    if (lockFolderPassword) lockFolderPassword.value = '';
    if (lockFolderPasswordConfirm) lockFolderPasswordConfirm.value = '';
    if (unlockFolderPassword) unlockFolderPassword.value = '';
    if (unlockError) unlockError.style.display = 'none';
    currentLockFolderPath = null;
}

// Check if folder is locked
async function checkFolderLocked(folderPath) {
    try {
        const response = await fetch(`${API_BASE}/folders/check-locked?owner=${ghUser}&repo=${ghRepo}&folderPath=${encodeURIComponent(folderPath)}`, {
            headers: { 'Authorization': `Bearer ${ghToken}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to check lock status');
        }
        
        const data = await response.json();
        return data.locked;
    } catch (error) {
        console.error('Error checking lock status:', error);
        return false;
    }
}

// Show lock folder dialog
async function showLockFolderDialog(folderPath) {
    currentLockFolderPath = 'Locked Folder';
    
    // Check if Locked Folder has a password
    const isLocked = await checkFolderLocked('Locked Folder');
    
    if (lockFolderForm && unlockFolderForm && lockedFolderAction) {
        if (isLocked) {
            // Show unlock form
            lockFolderForm.style.display = 'none';
            unlockFolderForm.style.display = 'block';
            lockedFolderAction.textContent = 'Unlock Locked Folder';
        } else {
            // Show lock form to set password
            lockFolderForm.style.display = 'block';
            unlockFolderForm.style.display = 'none';
            lockedFolderAction.textContent = 'Set Password for Locked Folder';
        }
    }
    
    if (lockedFolderModal) {
        lockedFolderModal.classList.remove('hidden');
        
        // Auto-focus the first input field based on which form is shown
        setTimeout(() => {
            if (isLocked) {
                // Focus unlock password input
                document.getElementById('unlockFolderPassword')?.focus();
            } else {
                // Focus lock password input
                document.getElementById('lockFolderPassword')?.focus();
            }
        }, 100);
    }
}

// Lock folder
if (confirmLockBtn) {
    confirmLockBtn.onclick = async () => {
        const password = lockFolderPassword.value;
        const confirmPassword = lockFolderPasswordConfirm.value;
        
        if (!password || password.length < 4) {
            alert('Password must be at least 4 characters');
            return;
        }
        
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        confirmLockBtn.disabled = true;
        confirmLockBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locking...';
        
        try {
            const response = await fetch(`${API_BASE}/folders/lock`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ghToken}`
                },
                body: JSON.stringify({
                    owner: ghUser,
                    repo: ghRepo,
                    password: password
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to lock folder');
            }
            
            const data = await response.json();
            
            // Close modal and reload files to show lock icon
            lockedFolderModal.classList.add('hidden');
            resetLockedFolderModal();
            
            // Show success message with hint
            alert(`✅ Password set successfully!\n\n💡 Recovery hint: ${data.hint}`);
            
            // Reload current view and sidebar to update icons
            await loadFiles(currentFolder);
            await loadSidebarFolders();
        } catch (error) {
            console.error('Error locking folder:', error);
            alert('Failed to lock folder: ' + error.message);
        } finally {
            confirmLockBtn.disabled = false;
            confirmLockBtn.innerHTML = '<i class="fas fa-lock"></i> Lock Folder';
        }
    };
}

// Unlock folder
if (confirmUnlockBtn) {
    confirmUnlockBtn.onclick = async () => {
        const password = unlockFolderPassword.value;
        
        if (!password) {
            alert('Please enter password');
            return;
        }
        
        confirmUnlockBtn.disabled = true;
        confirmUnlockBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unlocking...';
        
        try {
            const response = await fetch(`${API_BASE}/folders/unlock`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ghToken}`
                },
                body: JSON.stringify({
                    owner: ghUser,
                    repo: ghRepo,
                    password: password
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                if (response.status === 401) {
                    // Show error in modal
                    if (unlockError) {
                        unlockError.style.display = 'block';
                        unlockError.querySelector('span').textContent = 'Incorrect password';
                    }
                    return;
                }
                throw new Error(error.error || 'Failed to unlock folder');
            }
            
            // Add Locked Folder to unlocked folders for this session
            unlockedFolders.add('Locked Folder');
            
            // Close modal
            lockedFolderModal.classList.add('hidden');
            resetLockedFolderModal();
            
            // Reload sidebar to update icon
            await loadSidebarFolders();
            
            // Navigate to the Locked Folder (or return to where user was trying to go)
            const targetPath = currentFolder && currentFolder.startsWith('Locked Folder') ? currentFolder : 'Locked Folder';
            await selectFolder(targetPath);
        } catch (error) {
            console.error('Error unlocking folder:', error);
            alert('Failed to unlock folder: ' + error.message);
        } finally {
            confirmUnlockBtn.disabled = false;
            confirmUnlockBtn.innerHTML = '<i class="fas fa-unlock"></i> Unlock Folder';
        }
    };
}

// Remove lock from folder
if (removeLockBtn) {
    removeLockBtn.onclick = async () => {
        const password = unlockFolderPassword.value;
        
        if (!password) {
            alert('Please enter password to remove lock');
            return;
        }
        
        const confirmed = confirm('Are you sure you want to remove the lock from this folder? This action cannot be undone.');
        if (!confirmed) return;
        
        removeLockBtn.disabled = true;
        removeLockBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Removing...';
        
        try {
            const response = await fetch(`${API_BASE}/folders/unlock`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ghToken}`
                },
                body: JSON.stringify({
                    owner: ghUser,
                    repo: ghRepo,
                    password: password
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                if (response.status === 401) {
                    if (unlockError) {
                        unlockError.style.display = 'block';
                        unlockError.querySelector('span').textContent = 'Incorrect password';
                    }
                    return;
                }
                throw new Error(error.error || 'Failed to remove lock');
            }
            
            // Remove Locked Folder from unlocked folders
            unlockedFolders.delete('Locked Folder');
            
            // Close modal
            lockedFolderModal.classList.add('hidden');
            resetLockedFolderModal();
            
            alert('✅ Password removed successfully!');
            
            // Reload current view and sidebar to update icons
            await loadFiles(currentFolder);
            await loadSidebarFolders();
        } catch (error) {
            console.error('Error removing lock:', error);
            alert('Failed to remove lock: ' + error.message);
        } finally {
            removeLockBtn.disabled = false;
            removeLockBtn.innerHTML = '<i class="fas fa-trash"></i> Remove Lock';
        }
    };
}

window.showLockFolderDialog = showLockFolderDialog; // Expose globally for context menu
