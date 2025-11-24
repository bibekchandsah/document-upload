const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');

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
        } else {
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

// 8. Generate Share Link
const sharedLinks = {}; // In-memory store: { token: { filePath, expiresAt } }
const crypto = require('crypto');

app.post('/api/share', (req, res) => {
    const { path: filePath, duration } = req.body;
    if (!filePath || !duration) return res.status(400).json({ error: 'Path and duration are required' });

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + (duration * 60 * 1000); // duration in minutes

    sharedLinks[token] = { filePath, expiresAt };

    // Cleanup expired links periodically (optional, but good practice)
    // For simplicity, we'll check expiration on access.

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${token}`;
    res.json({ shareUrl, expiresAt });
});

// 9. Access Shared File
app.get('/share/:token', (req, res) => {
    const { token } = req.params;
    const linkData = sharedLinks[token];

    if (!linkData) {
        return res.status(404).send('Link not found or expired');
    }

    if (Date.now() > linkData.expiresAt) {
        delete sharedLinks[token]; // Cleanup
        return res.status(410).send('Link has expired');
    }

    const fullPath = path.join(UPLOADS_DIR, linkData.filePath);
    if (!fs.existsSync(fullPath)) {
        return res.status(404).send('File not found');
    }

    // Serve the file
    // We can force download or view based on type. Let's try to view.
    const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    fs.createReadStream(fullPath).pipe(res);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});