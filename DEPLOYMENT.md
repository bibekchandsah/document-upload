# Deploying to Railway

This guide will help you deploy your Document View application to Railway.

## Prerequisites

1. A [Railway account](https://railway.app/) (you can sign up with GitHub)
2. Your code pushed to a GitHub repository
3. GitHub token for logging functionality (optional but recommended)

## Deployment Steps

### 1. Push Your Code to GitHub

Make sure your code is in a GitHub repository:

```bash
git init
git add .
git commit -m "Initial commit for Railway deployment"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Create a New Project on Railway

1. Go to [Railway](https://railway.app/)
2. Click **"Start a New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub account if needed
5. Select your repository

### 3. Configure Environment Variables

After deploying, you need to add environment variables:

1. In your Railway project dashboard, click on your service
2. Go to the **"Variables"** tab
3. Add the following environment variables:

```
LOGS_GITHUB_TOKEN=your_github_personal_access_token
LOGS_USERNAME=your_github_username
LOGS_REPOSITORY=webservicelogs
LOGS_FOLDER_NAME=merodocument
LOGS_FILE_NAME=logs.csv
```

#### How to Get a GitHub Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with **`repo`** scope (full control of private repositories)
3. Copy the token and paste it as `LOGS_GITHUB_TOKEN`

### 4. Deploy

Railway will automatically deploy your application. You can:

- View logs in the **"Deployments"** tab
- Access your app via the public URL provided by Railway
- Find your public URL in the **"Settings"** → **"Domains"** section

### 5. Add a Custom Domain (Optional)

1. Go to **"Settings"** → **"Domains"**
2. Click **"Generate Domain"** for a Railway subdomain
3. Or add your own custom domain

## Important Notes

### File Persistence

⚠️ **Railway uses ephemeral storage** - files uploaded to the `uploads/` directory will be deleted when your app restarts or redeploys.

**Solutions:**
1. **Use Railway Volumes** (recommended for Railway):
   - Add a persistent volume in Railway dashboard
   - Mount it to `/app/uploads`

2. **Use Cloud Storage** (best for production):
   - AWS S3
   - Cloudflare R2
   - Google Cloud Storage
   - Azure Blob Storage

### Environment Variables

All sensitive information should be stored in Railway environment variables, not in your code.

### Monitoring

- Check the **"Metrics"** tab for CPU, memory, and network usage
- View logs in real-time from the **"Deployments"** tab

## Troubleshooting

### Build Fails

- Check the build logs in Railway dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility

### Application Crashes

- Check runtime logs for errors
- Ensure `PORT` environment variable is used correctly
- Verify all required environment variables are set

### File Upload Issues

- Check that the `uploads/` directory is being created
- Consider implementing cloud storage for production use
- Verify multer configuration

## Cost

Railway offers:
- **Free tier**: $5 of usage per month
- **Pro plan**: $20/month with $20 credit

Your app should easily run within the free tier limits for moderate usage.

## Support

- Railway Documentation: https://docs.railway.app/
- Railway Discord: https://discord.gg/railway
- GitHub Issues: Report issues in your repository

---

**Your app will be live at:** `https://your-app-name.up.railway.app`
