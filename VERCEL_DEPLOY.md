# Deploying to Vercel

## ⚠️ Important Limitations

This application was designed for traditional server environments (Railway/Heroku). Vercel's serverless architecture has limitations:

1. **No Persistent Local Storage**: The `/uploads` directory won't work on Vercel
2. **Stateless Functions**: In-memory storage (share links, locked folders) resets between requests
3. **Function Timeout**: 10-second limit on Hobby plan (60s on Pro)

## Recommended: Use GitHub-Only Mode

Since your app already has GitHub integration, the best approach is to:
- **Disable local uploads** - Use GitHub storage exclusively
- Store share links and folder locks in a database (e.g., Vercel KV, MongoDB Atlas)

## Quick Deploy Steps

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy
```bash
vercel
```

Follow the prompts:
- Set up and deploy: **Y**
- Which scope: Select your account
- Link to existing project: **N**
- Project name: `document-view` (or your choice)
- Directory: `./`
- Override settings: **N**

### 4. Set Environment Variables (if any)
```bash
vercel env add GITHUB_TOKEN
vercel env add PORT
```

### 5. Deploy to Production
```bash
vercel --prod
```

## Alternative: Better Hosting Options

Given your app's architecture, consider these instead:

### **Railway** (Already Configured ✅)
- Supports persistent storage
- Better for this app type
- See [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)

### **Render**
```bash
# Add to your repo
echo "node_modules" > .gitignore
git add .
git commit -m "Prepare for Render"
```
- Go to [render.com](https://render.com)
- Connect your GitHub repo
- Choose "Web Service"
- Build command: `npm install`
- Start command: `npm start`

### **Fly.io**
```bash
# Install Fly CLI
# Windows: iwr https://fly.io/install.ps1 -useb | iex

# Deploy
fly launch
fly deploy
```

## Vercel-Specific Modifications (If You Proceed)

### File: `server.js`
Add at the top:
```javascript
// Disable local uploads on Vercel
const IS_VERCEL = process.env.VERCEL === '1';

if (IS_VERCEL) {
    console.warn('⚠️  Running on Vercel - Local uploads disabled');
    console.warn('ℹ️  Use GitHub storage exclusively');
}
```

### Disable Upload Endpoints
Wrap upload endpoints with:
```javascript
if (!IS_VERCEL) {
    app.post('/api/upload', upload.array('files'), (req, res) => {
        // ... existing code
    });
}
```

## Recommended Action

**Unless you modify the app significantly, I recommend using Railway or Render instead of Vercel.**

Your app is already configured for Railway - check [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md) for easy deployment.

## Questions?

- Need help with Railway deployment? ✅
- Want to modify the app for Vercel? 🛠️
- Looking for database integration? 💾

Let me know how you'd like to proceed!
