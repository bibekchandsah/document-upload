# Document View - File Management System

A web-based document management system with image editing capabilities, folder organization, and secure sharing features.

## Features

- 📁 File upload and organization
- 🖼️ Image editing with filters and adjustments
- 📂 Folder management and navigation
- 🔗 Secure file sharing with expirable links
- 🔐 User authentication
- 📊 Activity logging
- 🌐 Offline support (PWA)
- 📱 Responsive design

## Tech Stack

- **Backend:** Node.js, Express
- **File Processing:** Multer, Sharp, HEIC-Convert
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Storage:** File system (with cloud storage support)
- **Logging:** GitHub API integration

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/bibekchandsah/document-upload.git
cd document-upload
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`

5. Start the server:
```bash
npm start
```

6. Open your browser and navigate to:
```
http://localhost:3000
```

## Deployment

### Deploy to Railway

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed Railway deployment instructions.

**Quick Steps:**
1. Push your code to GitHub
2. Create a new project on [Railway](https://railway.app/)
3. Connect your GitHub repository
4. Add environment variables
5. Deploy!

Your app will be live at: `https://your-app-name.up.railway.app`

### Environment Variables

Create a `.env` file with the following variables:

```env
LOGS_GITHUB_TOKEN=your_github_token_here
LOGS_USERNAME=your_github_username
LOGS_REPOSITORY=webservicelogs
LOGS_FOLDER_NAME=merodocument
LOGS_FILE_NAME=logs.csv
```

## Usage

### Uploading Files

1. Navigate to the main page
2. Select a folder or create a new one
3. Click "Upload" and choose your files
4. Files are automatically organized and thumbnails are generated

### Image Editing

1. Click on any image to open the editor
2. Apply filters, adjust brightness, contrast, etc.
3. Save your edited image

### Sharing Files

1. Right-click on any file
2. Select "Share"
3. Set expiration time and access permissions
4. Copy and share the generated link

### Folder Management

- Create new folders
- Rename folders
- Delete folders
- Navigate folder hierarchy
- Move files between folders

## API Endpoints

### File Operations
- `POST /upload` - Upload files
- `GET /files/:username` - List user files
- `GET /uploads/:username/:folder/:filename` - Get file
- `DELETE /files/:username/:folder/:filename` - Delete file

### Folder Operations
- `POST /folders/:username` - Create folder
- `DELETE /folders/:username/:folderName` - Delete folder
- `PUT /folders/:username/:oldFolderName` - Rename folder

### Sharing
- `POST /share/:username` - Create share link
- `GET /s/:token` - Access shared file
- `DELETE /share/:username/:token` - Revoke share link

## Security Features

- User authentication
- Secure file access
- Expirable share links
- Activity logging
- Input validation
- Path traversal prevention

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile browsers

## Development

### Project Structure

```
├── public/              # Frontend files
│   ├── index.html      # Main application
│   ├── login.html      # Login page
│   ├── app.js          # Main application logic
│   ├── imageEditor.js  # Image editing functionality
│   └── style.css       # Styles
├── uploads/            # File storage (ephemeral on Railway)
├── server.js           # Express server
├── logger.js           # Activity logging
├── package.json        # Dependencies
└── .env.example        # Environment template
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Important Notes

### File Storage on Railway

⚠️ **Railway uses ephemeral storage** - uploaded files will be deleted on restart/redeploy.

**Production Solutions:**
- Use Railway Volumes for persistence
- Integrate cloud storage (S3, Cloudflare R2, etc.)

### Logging

The application logs activities to a GitHub repository. Ensure you have:
- A valid GitHub personal access token
- The logging repository created
- Proper permissions set

## License

ISC

## Author

bibekchandsah

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/bibekchandsah/document-upload).

---

**Live Demo:** [Your Railway URL here]
