# 🚀 Quick Deploy to Railway

## Step-by-Step Guide (5 minutes)

### 1️⃣ Prepare Your Code

Your code is already configured! Just make sure you have:
- ✅ `package.json` with start script
- ✅ `server.js` using `process.env.PORT`
- ✅ `.gitignore` excluding `node_modules` and `.env`

### 2️⃣ Push to GitHub

```bash
# If you haven't initialized git yet
git init
git add .
git commit -m "Ready for Railway deployment"

# Connect to your GitHub repository
git remote add origin https://github.com/bibekchandsah/document-upload.git
git branch -M main
git push -u origin main
```

### 3️⃣ Deploy to Railway

1. **Go to Railway**: https://railway.app/
2. **Sign in** with your GitHub account
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Choose **"bibekchandsah/document-upload"**
6. Railway will automatically detect and deploy your Node.js app

### 4️⃣ Configure Environment Variables

In your Railway project dashboard:

1. Click on your service
2. Go to **"Variables"** tab
3. Click **"+ New Variable"**
4. Add these one by one:

```
LOGS_GITHUB_TOKEN=your_github_token
LOGS_USERNAME=bibekchandsah
LOGS_REPOSITORY=webservicelogs
LOGS_FOLDER_NAME=merodocument
LOGS_FILE_NAME=logs.csv
```

#### 🔑 Get Your GitHub Token:
1. Go to: https://github.com/settings/tokens/new
2. Give it a name: "Railway Document App"
3. Select scope: ✅ **repo** (full control)
4. Click **"Generate token"**
5. Copy and save it (you won't see it again!)

### 5️⃣ Get Your Public URL

1. In Railway, go to **"Settings"** tab
2. Scroll to **"Domains"**
3. Click **"Generate Domain"**
4. Your app will be live at: `https://your-app-name.up.railway.app`

## ✅ You're Done!

Your app is now publicly accessible! Share the URL with anyone.

## 🔧 Important: File Storage

⚠️ **Files uploaded will be deleted when Railway restarts your app.**

### Solutions:

**Option 1: Use Railway Volumes (Recommended)**
1. In Railway dashboard, go to your service
2. Click **"Volumes"** tab
3. Click **"New Volume"**
4. Mount path: `/app/uploads`
5. This keeps your uploads persistent

**Option 2: Use Cloud Storage (Best for Production)**
- Integrate AWS S3, Cloudflare R2, or similar
- Modify `server.js` to use cloud storage instead of local files

## 📊 Monitor Your App

Railway Dashboard shows:
- 📈 CPU & Memory usage
- 📝 Real-time logs
- 🔄 Deployment history
- 💰 Usage & costs

## 💰 Pricing

- **Starter (Free)**: $5 usage credit/month
- **Pro**: $20/month + $20 credit

Your app should run fine on the free tier for personal use!

## 🐛 Troubleshooting

### Build Failed?
- Check logs in Railway dashboard
- Ensure all dependencies are in `package.json`
- Verify `npm install` works locally

### App Not Loading?
- Check if `PORT` environment variable is used
- View logs for error messages
- Ensure all environment variables are set

### Uploads Not Working?
- Add a Railway Volume (see above)
- Or implement cloud storage integration

## 🆘 Need Help?

- Railway Docs: https://docs.railway.app/
- Railway Discord: https://discord.gg/railway
- GitHub Issues: https://github.com/bibekchandsah/document-upload/issues

---

**Next Steps:**
- ✅ Deploy the app
- ✅ Share your public URL
- ✅ Add a custom domain (optional)
- ✅ Set up Railway Volume for file persistence
