const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const crypto = require('crypto');

// In-memory storage for share links: Map<username, Map<token, linkData>>
const shareLinks = new Map();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folderName = req.body.folder || 'default';
        const folderPath = path.join(UPLOADS_DIR, folderName);

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        cb(null, folderPath);
    },
    filename: (req, file, cb) => {
        // cb(null, Date.now() + '-' + file.originalname);    // Add timestamp to filename
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// --- API Endpoints ---

// 1. List files and folders (Unified API)
app.get('/api/files', (req, res) => {
    const folder = req.query.folder || '';
    const folderPath = path.join(UPLOADS_DIR, folder);

    // Security check
    if (!folderPath.startsWith(UPLOADS_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const items = fs.readdirSync(folderPath, { withFileTypes: true }).map(item => {
            const itemPath = path.join(folderPath, item.name);
            const stats = fs.statSync(itemPath);
            return {
                name: item.name,
                isDirectory: item.isDirectory(),
                size: stats.size,
                date: stats.mtime,
                type: item.isDirectory() ? 'folder' : (mime.lookup(item.name) || 'application/octet-stream')
            };
        });

        // Sort: Folders first, then files
        items.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) {
                return a.name.localeCompare(b.name);
            }
            return a.isDirectory ? -1 : 1;
        });

        res.json(items);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to list items' });
    }
});

// 2. Create a new folder
app.post('/api/folders', (req, res) => {
    const { name, parentFolder } = req.body;
    if (!name) return res.status(400).json({ error: 'Folder name is required' });

    // Basic sanitization for the new folder name only
    const sanitizedName = name.replace(/[^a-zA-Z0-9 _-]/g, '');
    const parentPath = parentFolder || '';
    const folderPath = path.join(UPLOADS_DIR, parentPath, sanitizedName);

    // Security check
    if (!folderPath.startsWith(UPLOADS_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
            res.status(201).json({ message: 'Folder created', name: sanitizedName });
        }
        else if (fs.existsSync(folderPath)) {
            res.status(500).json({ error: 'Folder already exists' });
        }
        else {
            res.status(400).json({ error: 'Folder already exists' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// 3. Upload files
app.post('/api/upload', upload.array('files'), (req, res) => {
    res.json({ message: 'Files uploaded successfully', files: req.files });
});

// 4. Stream file (View)
app.get('/api/view', (req, res) => {
    const filePathParam = req.query.path;
    if (!filePathParam) return res.status(400).json({ error: 'Path is required' });

    const filePath = path.join(UPLOADS_DIR, filePathParam);

    if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    fs.createReadStream(filePath).pipe(res);
});

// 5. Download file
app.get('/api/download', (req, res) => {
    const filePathParam = req.query.path;
    if (!filePathParam) return res.status(400).json({ error: 'Path is required' });

    const filePath = path.join(UPLOADS_DIR, filePathParam);

    if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    res.download(filePath);
});

// 6. Check for duplicate files
app.post('/api/check-duplicates', (req, res) => {
    const { folder, filenames } = req.body;
    if (!filenames || !Array.isArray(filenames)) {
        return res.status(400).json({ error: 'Filenames array is required' });
    }

    const folderPath = path.join(UPLOADS_DIR, folder || '');

    // Security check
    if (!folderPath.startsWith(UPLOADS_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const duplicates = [];
    try {
        if (fs.existsSync(folderPath)) {
            filenames.forEach(name => {
                if (fs.existsSync(path.join(folderPath, name))) {
                    duplicates.push(name);
                }
            });
        }
        res.json({ duplicates });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to check duplicates' });
    }
});

// 7. Smart Search
app.get('/api/search', (req, res) => {
    const { q, type } = req.query;
    if (!q) return res.json([]);

    const results = [];
    const searchRecursive = (dir, relativePath) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const itemPath = path.join(dir, item.name);
            const itemRelativePath = path.join(relativePath, item.name);

            if (item.isDirectory()) {
                searchRecursive(itemPath, itemRelativePath);
            } else {
                // Filter by Name
                if (!item.name.toLowerCase().includes(q.toLowerCase())) continue;

                // Filter by Type
                if (type && type !== 'all') {
                    const mimeType = mime.lookup(item.name) || '';
                    let match = false;
                    if (type === 'image' && mimeType.startsWith('image/')) match = true;
                    if (type === 'video' && mimeType.startsWith('video/')) match = true;
                    if (type === 'audio' && mimeType.startsWith('audio/')) match = true;
                    if (type === 'document' && (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('sheet') || mimeType.includes('text'))) match = true;

                    if (!match) continue;
                }

                const stats = fs.statSync(itemPath);
                results.push({
                    name: item.name,
                    isDirectory: false,
                    size: stats.size,
                    date: stats.mtime,
                    type: mime.lookup(item.name) || 'application/octet-stream',
                    path: relativePath // Store the folder path for context
                });
            }
        }
    };

    try {
        searchRecursive(UPLOADS_DIR, '');
        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Search failed' });
    }
});


// 10. GitHub Integration
const { Octokit } = require('octokit');

// Helper to get Octokit instance
const getOctokit = (token) => new Octokit({ auth: token });

// Validate Token
app.post('/api/github/validate', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    try {
        const octokit = getOctokit(token);
        const { data } = await octokit.rest.users.getAuthenticated();
        res.json({ username: data.login, avatar_url: data.avatar_url });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// List Repositories
app.get('/api/github/repos', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token required' });

    try {
        const octokit = getOctokit(token);
        const { data } = await octokit.rest.repos.listForAuthenticatedUser({
            sort: 'updated',
            per_page: 100
        });
        res.json(data.map(repo => ({ name: repo.name, private: repo.private })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to list repos' });
    }
});

// Create Repository
app.post('/api/github/create-repo', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { name, private: isPrivate } = req.body;
    if (!token || !name) return res.status(400).json({ error: 'Missing requirements' });

    try {
        const octokit = getOctokit(token);
        const { data } = await octokit.rest.repos.createForAuthenticatedUser({
            name,
            private: isPrivate,
            auto_init: true // Create with README so we can add files
        });
        res.json({ name: data.name });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create repo' });
    }
});

// List Files (from 'uploads' folder)
app.get('/api/github/files', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { owner, repo, branch, path: dirPath = '' } = req.query;

    if (!token || !owner || !repo) return res.status(400).json({ error: 'Missing requirements' });

    try {
        const octokit = getOctokit(token);
        // We prefix everything with 'uploads/' to keep the repo clean
        const targetPath = dirPath ? `uploads/${dirPath}` : 'uploads';

        let data;
        try {
            const response = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: targetPath,
                ref: branch || 'main'
            });
            data = response.data;
        } catch (err) {
            if (err.status === 404) {
                // Folder doesn't exist yet, return empty
                return res.json([]);
            }
            throw err;
        }

        if (!Array.isArray(data)) {
            // It's a file, not a directory
            return res.json([]);
        }

        const items = data.map(item => ({
            name: item.name,
            isDirectory: item.type === 'dir',
            size: item.size,
            date: null, // GitHub API doesn't give mtime in simple list
            type: item.type === 'dir' ? 'folder' : (mime.lookup(item.name) || 'application/octet-stream'),
            path: dirPath // Relative path for frontend context
        }));

        // Sort
        items.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        res.json(items);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// Upload File
app.post('/api/github/upload', upload.array('files'), async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { owner, repo, branch, folder } = req.body;

    if (!token || !owner || !repo || !req.files) return res.status(400).json({ error: 'Missing requirements' });

    try {
        const octokit = getOctokit(token);
        const results = [];

        for (const file of req.files) {
            const content = fs.readFileSync(file.path, { encoding: 'base64' });
            const filePath = folder ? `uploads/${folder}/${file.originalname}` : `uploads/${file.originalname}`;

            // Check if file exists to get SHA for update
            let sha;
            try {
                const { data } = await octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: filePath,
                    ref: branch || 'main'
                });
                sha = data.sha;
            } catch (e) { /* File doesn't exist */ }

            await octokit.rest.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: filePath,
                message: `Upload ${file.originalname}`,
                content,
                sha,
                branch: branch || 'main'
            });

            // Clean up local temp file
            fs.unlinkSync(file.path);
            results.push(file.originalname);
        }

        res.json({ message: 'Uploaded', files: results });
    } catch (error) {
        console.error(error);
        // Clean up temp files on error
        req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path) });
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Create Folder (create .keep file)
app.post('/api/github/create-folder', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { owner, repo, branch, folder, name } = req.body;

    if (!token || !owner || !repo || !name) return res.status(400).json({ error: 'Missing requirements' });

    try {
        const octokit = getOctokit(token);
        const newFolderPath = folder ? `uploads/${folder}/${name}` : `uploads/${name}`;
        const keepFilePath = `${newFolderPath}/.keep`;

        await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: keepFilePath,
            message: `Create folder ${name}`,
            content: Buffer.from('').toString('base64'),
            branch: branch || 'main'
        });

        res.json({ message: 'Folder created' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// View File Content (Proxy to avoid CORS and Auth issues on frontend)
app.get('/api/github/view', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { owner, repo, branch, path: filePath } = req.query;

    if (!token || !owner || !repo || !filePath) return res.status(400).json({ error: 'Missing requirements' });

    try {
        const octokit = getOctokit(token);
        // If filePath doesn't start with uploads/, add it (unless it's a raw full path request)
        // Actually, frontend usually sends relative path.
        const fullPath = filePath.startsWith('uploads/') ? filePath : `uploads/${filePath}`;

        // Get file metadata and content
        const response = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: fullPath,
            ref: branch || 'main'
            // Don't use mediaType: raw - it returns corrupted ArrayBuffer
        });

        // Validate it's a file
        if (response.data.type !== 'file') {
            return res.status(400).send('Not a file');
        }

        let buffer;

        // GitHub API limitation: content field only exists for files < 1MB
        if (response.data.content) {
            // Small file: decode base64 (GitHub includes newlines - remove them)
            const base64Content = response.data.content.replace(/\n/g, '');
            buffer = Buffer.from(base64Content, 'base64');
        } else if (response.data.download_url) {
            // Large file (>1MB): fetch from download URL
            const downloadResponse = await fetch(response.data.download_url, {
                headers: { 'Authorization': `token ${token}` }
            });

            if (!downloadResponse.ok) {
                throw new Error(`Failed to download large file: ${downloadResponse.status}`);
            }

            const arrayBuffer = await downloadResponse.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        } else {
            return res.status(400).send('File content not available');
        }

        // Determine mime type
        const mimeType = mime.lookup(filePath) || 'application/octet-stream';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (error) {
        console.error(error);
        res.status(404).send('File not found');
    }
});

// Share Links - Create
app.post('/api/share/create', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { owner, repo, branch, path: filePath, expirationHours } = req.body;

    if (!token || !owner || !repo || !filePath || !expirationHours) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const { Octokit } = require('octokit');
        const octokit = new Octokit({ auth: token });
        const { data: userData } = await octokit.rest.users.getAuthenticated();
        const username = userData.login;

        // Generate secure token
        const shareToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

        // Store link
        if (!shareLinks.has(username)) {
            shareLinks.set(username, new Map());
        }
        shareLinks.get(username).set(shareToken, {
            filePath,
            owner,
            repo,
            branch: branch || 'main',
            expiresAt,
            createdAt: new Date(),
            token: token // Store GitHub token for proxying access
        });

        const shareUrl = `${req.protocol}://${req.get('host')}/api/share/${username}/${shareToken}`;
        res.json({ token: shareToken, url: shareUrl, expiresAt: expiresAt.toISOString(), username });
    } catch (error) {
        console.error('Error creating share link:', error);
        res.status(500).json({ error: 'Failed to create share link' });
    }
});

// Share Links - Access (Page)
app.get('/api/share/:username/:token', async (req, res) => {
    const { username, token } = req.params;

    try {
        if (!shareLinks.has(username)) {
            return res.status(404).send('Share link not found');
        }

        const userLinks = shareLinks.get(username);
        const linkData = userLinks.get(token);

        if (!linkData) {
            return res.status(404).send('Share link not found');
        }

        // Check expiration
        if (new Date() > new Date(linkData.expiresAt)) {
            userLinks.delete(token);
            if (userLinks.size === 0) shareLinks.delete(username);
            return res.status(410).send('Share link has expired');
        }

        const { owner, repo, branch, filePath } = linkData;
        const fullPath = filePath.startsWith('uploads/') ? filePath : `uploads/${filePath}`;
        const fileName = path.basename(filePath);

        // Return HTML page with Modal
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Shared: ${fileName}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        body { background: #f3f4f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .container { max-width: 500px; width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); padding: 2rem; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #1f2937; text-align: center; }
        .file-icon-large { font-size: 3rem; text-align: center; margin: 1.5rem 0; }
        .info { background: #f9fafb; padding: 1rem; border-radius: 8px; margin: 1rem 0; font-size: 0.875rem; }
        .info-row { display: flex; justify-content: space-between; padding: 0.5rem 0; }
        .label { color: #6b7280; }
        .value { color: #1f2937; font-weight: 500; }
        .btn { display: inline-block; background: #2563eb; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 500; text-align: center; transition: background 0.2s; cursor: pointer; border: none; font-size: 1rem; }
        .btn:hover { background: #1d4ed8; }
        .expires { text-align: center; color: #ef4444; font-size: 0.875rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="file-icon-large">📄</div>
        <h1>${fileName}</h1>
        <div class="info">
            <div class="info-row"><span class="label">Repository:</span><span class="value">${owner}/${repo}</span></div>
            <div class="info-row"><span class="label">Shared by:</span><span class="value">${username}</span></div>
            <div class="info-row"><span class="label">Branch:</span><span class="value">${branch}</span></div>
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 1rem;">
            <button onclick="openViewer()" class="btn">View File</button>
            <a href="/api/share/${username}/${token}/download?download=true" class="btn" style="background: #10b981;">Download</a>
        </div>
        <div style="text-align: center; margin-top: 1rem;">
            <a href="https://github.com/${owner}/${repo}/blob/${branch}/${fullPath}" style="color: #6b7280; text-decoration: none; font-size: 0.875rem;" target="_blank">View on GitHub (Login Required)</a>
        </div>
        <div class="expires">⏰ Expires: ${new Date(linkData.expiresAt).toLocaleString()}</div>
    </div>

    <!-- Document Viewer Modal -->
    <div id="viewerModal" class="modal hidden">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="viewerFileName">${fileName}</h3>
                <div class="modal-actions">
                    <a id="modalDownloadLink" href="/api/share/${username}/${token}/download?download=true" class="icon-btn" title="Download"><i class="fas fa-download"></i></a>
                    <button id="printBtn" class="icon-btn" title="Print" onclick="window.print()"><i class="fas fa-print"></i></button>
                    <button id="closeViewerBtn" class="icon-btn" title="Close" onclick="closeViewer()"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="modal-body" id="viewerBody">
                <!-- Content (Iframe or Image) goes here -->
            </div>
        </div>
    </div>

    <script>
        const viewerModal = document.getElementById('viewerModal');
        const viewerBody = document.getElementById('viewerBody');
        const fileName = "${fileName}";
        const downloadUrl = "/api/share/${username}/${token}/download";

        function openViewer() {
            viewerModal.classList.remove('hidden');
            viewerBody.innerHTML = '<div style="text-align:center"><i class="fas fa-spinner fa-spin" style="font-size:2rem"></i><p>Loading preview...</p></div>';

            const isDoc = fileName.match(/\\.(docx|doc|xlsx|xls|pptx|ppt|csv)$/i);
            const isText = fileName.match(/\\.(txt|json|md|js|css|html)$/i);
            const isVideo = fileName.match(/\\.(mp4|webm|ogg|mp3)$/i);
            const isImage = fileName.match(/\\.(jpg|jpeg|png|gif|webp|svg)$/i);
            const isPdf = fileName.match(/\\.pdf$/i);

            fetch(downloadUrl)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to load file');
                    return res.blob();
                })
                .then(blob => {
                    const objectUrl = URL.createObjectURL(blob);
                    
                    if (isImage) {
                        const img = document.createElement('img');
                        img.src = objectUrl;
                        viewerBody.innerHTML = '';
                        viewerBody.appendChild(img);
                    } else if (isPdf) {
                        // Check if mobile device
                        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
                        
                        if (isMobile) {
                            // Use Google Docs Viewer for mobile
                            const shareUrl = window.location.origin + downloadUrl;
                            const googleViewerUrl = \`https://docs.google.com/gview?url=\${encodeURIComponent(shareUrl)}&embedded=true\`;
                            const iframe = document.createElement('iframe');
                            iframe.src = googleViewerUrl;
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            iframe.style.border = 'none';
                            viewerBody.innerHTML = '';
                            viewerBody.appendChild(iframe);
                        } else {
                            // Desktop: native PDF viewer
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
                    } else if (isDoc) {
                        // Use Google Docs Viewer for Office documents
                        const shareUrl = window.location.origin + downloadUrl;
                        const googleViewerUrl = \`https://docs.google.com/gview?url=\${encodeURIComponent(shareUrl)}&embedded=true\`;
                        const iframe = document.createElement('iframe');
                        iframe.src = googleViewerUrl;
                        iframe.style.width = '100%';
                        iframe.style.height = '100%';
                        iframe.style.border = 'none';
                        viewerBody.innerHTML = '';
                        viewerBody.appendChild(iframe);
                        
                        // Add fallback link
                        setTimeout(() => {
                            const fallbackDiv = document.createElement('div');
                            fallbackDiv.style.position = 'absolute';
                            fallbackDiv.style.bottom = '10px';
                            fallbackDiv.style.right = '10px';
                            fallbackDiv.innerHTML = \`
                                <a href="\${downloadUrl}?download=true" class="btn" style="font-size: 0.875rem; padding: 0.5rem 1rem; background: #10b981;">
                                    <i class="fas fa-download"></i> Download
                                </a>\`;
                            viewerBody.style.position = 'relative';
                            viewerBody.appendChild(fallbackDiv);
                        }, 3000);
                    } else {
                        // Try Google Docs Viewer for other file types
                        const shareUrl = window.location.origin + downloadUrl;
                        const googleViewerUrl = \`https://docs.google.com/gview?url=\${encodeURIComponent(shareUrl)}&embedded=true\`;
                        const iframe = document.createElement('iframe');
                        iframe.src = googleViewerUrl;
                        iframe.style.width = '100%';
                        iframe.style.height = '100%';
                        iframe.style.border = 'none';
                        
                        // Add loading indicator and fallback
                        viewerBody.innerHTML = '<div style="text-align:center"><i class="fas fa-spinner fa-spin" style="font-size:2rem"></i><p>Loading preview...</p></div>';
                        
                        setTimeout(() => {
                            viewerBody.innerHTML = '';
                            viewerBody.appendChild(iframe);
                            
                            // Add download fallback after timeout
                            setTimeout(() => {
                                const fallbackDiv = document.createElement('div');
                                fallbackDiv.style.position = 'absolute';
                                fallbackDiv.style.bottom = '10px';
                                fallbackDiv.style.right = '10px';
                                fallbackDiv.innerHTML = \`
                                    <a href="\${downloadUrl}?download=true" class="btn" style="font-size: 0.875rem; padding: 0.5rem 1rem; background: #10b981;">
                                        <i class="fas fa-download"></i> Download
                                    </a>\`;
                                viewerBody.style.position = 'relative';
                                viewerBody.appendChild(fallbackDiv);
                            }, 2000);
                        }, 500);
                    }
                })
                .catch(err => {
                    console.error(err);
                    viewerBody.innerHTML = '<p style="color:red">Failed to load file preview</p>';
                });
        }

        function closeViewer() {
            viewerModal.classList.add('hidden');
            viewerBody.innerHTML = '';
        }

        // Close on click outside
        viewerModal.onclick = (e) => {
            if (e.target === viewerModal) closeViewer();
        };
    </script>
</body>
</html>`;

        res.send(html);
    } catch (error) {
        console.error('Error accessing share link:', error);
        res.status(500).send('Error accessing shared file');
    }
});

// Share Links - Download/View Proxy
app.get('/api/share/:username/:token/download', async (req, res) => {
    const { username, token } = req.params;
    const isDownload = req.query.download === 'true';

    try {
        if (!shareLinks.has(username)) return res.status(404).send('Share link not found');
        const userLinks = shareLinks.get(username);
        const linkData = userLinks.get(token);

        if (!linkData) return res.status(404).send('Share link not found');

        // Check expiration
        if (new Date() > new Date(linkData.expiresAt)) {
            userLinks.delete(token);
            if (userLinks.size === 0) shareLinks.delete(username);
            return res.status(410).send('Share link has expired');
        }

        const { owner, repo, branch, filePath, token: githubToken } = linkData;
        const fullPath = filePath.startsWith('uploads/') ? filePath : `uploads/${filePath}`;

        const octokit = getOctokit(githubToken);

        // Get file content
        const response = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: fullPath,
            ref: branch || 'main'
        });

        let buffer;
        if (response.data.content) {
            const base64Content = response.data.content.replace(/\n/g, '');
            buffer = Buffer.from(base64Content, 'base64');
        } else if (response.data.download_url) {
            const downloadResponse = await fetch(response.data.download_url, {
                headers: { 'Authorization': `token ${githubToken}` }
            });
            if (!downloadResponse.ok) throw new Error('Failed to download file');
            const arrayBuffer = await downloadResponse.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        } else {
            return res.status(400).send('File content not available');
        }

        const mimeType = mime.lookup(filePath) || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', buffer.length);

        if (isDownload) {
            res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
        } else {
            res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
        }

        res.send(buffer);
    } catch (error) {
        console.error('Error proxying shared file:', error);
        res.status(500).send('Error retrieving file');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});