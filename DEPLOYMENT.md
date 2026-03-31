# Ludo Online - Deployment Guide

This guide shows how to deploy the Ludo Online game to various hosting platforms.

## Prerequisites

1. **IMPORTANT: Always rebuild before deploying**
   ```bash
   npm run clean
   npm run build
   ```

2. The built files will be in `server/dist/`

3. **Key point**: The Dockerfile now automatically builds the client, so you don't need to run the build locally before dockerizing. However, for other deployment methods, you MUST run `npm run build` in the root directory.

## Deployment Options

### 0. Manual Deployment Checklist

ALWAYS follow this before deploying to ANY service:
```bash
# Step 1: Clean old builds
npm run clean

# Step 2: Build everything fresh
npm run build

# Step 3: Verify build succeeded
ls server/dist/
ls server/dist/assets/

# Step 4: Test locally
npm start
# Visit http://localhost:4000 and verify all changes are present

# Step 5: Push to your deployment service
git add -A
git commit -m "Deploy: latest changes"
git push origin main
```

### 1. Railway (Recommended)

Railway automatically detects Node.js apps and provides free tier. Since the Dockerfile now builds the client:

1. Go to [Railway.app](https://railway.app)
2. Connect your GitHub repository
3. Railway will use the Dockerfile automatically
4. Your app will deploy with the latest client build

**Important**: If you deployed before the Dockerfile fix, purge the build cache:
- Go to Railway project settings
- Clear the build cache
- Redeploy

### 2. Render

1. Go to [Render.com](https://render.com)
2. Create a new Web Service
3. Connect your repository
4. Set build command: `npm run clean && npm run build`
5. Set start command: `npm --prefix server start`
6. Deploy

**Important**: Clear your previous deployment cache if the old version persists:
- Delete and recreate the service
- Or go to Settings → Clear build cache

### 3. Heroku

1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create your-app-name`
4. Build and deploy:
   ```bash
   npm run clean
   npm run build
   heroku container:login
   heroku container:push web
   heroku container:release web
   ```

### 4. Vercel

For Vercel, you need a custom configuration since it's not just Node.js:

Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/src/index.js",
      "use": "@vercel/node"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  },
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server/src/index.js"
    }
  ]
}
```

Deploy:
```bash
npm run clean
npm run build
vercel
```

### 5. DigitalOcean App Platform

1. Go to DigitalOcean App Platform
2. Create a new app from GitHub
3. Set resource type to "Web Service"
4. Configure:
   - Build command: `npm run clean && npm run build`
   - Run command: `npm --prefix server start`
   - HTTP port: `4000`

### 6. Docker Deployment (Any Cloud Provider)

The updated Dockerfile automatically builds the client, so you can deploy with:

```bash
docker build -t ludo-online .
docker run -p 4000:4000 ludo-online
```

## Environment Variables

Most platforms automatically set `PORT`. If you need to override the server URL:

- `VITE_SERVER_URL`: Override the server URL (useful for development)
- `PORT`: Set to your desired port (default: 4000)

## Troubleshooting Old Version Being Served

### Problem: Deployment shows old version
 
**Solution Steps:**

1. **Verify local build has latest changes**:
   ```bash
   npm run clean
   npm run build
   npm start
   ```
   - Manually check the app in browser
   - Open DevTools → Sources to verify new files are there

2. **Force deployment cache clear**:
   - **Railway**: Settings → Clear build cache → Redeploy
   - **Render**: Delete & recreate the service
   - **Heroku**: `heroku builds:cache:purge`
   - **Docker**: Add `--no-cache` flag: `docker build --no-cache -t ludo-online .`

3. **Browser cache**:
   - Hard refresh: `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
   - Or use DevTools: Disable cache while DevTools is open

4. **Verify server is running the new version**:
   - Go to `/health` endpoint on your deployed app
   - Check the room count
   - Look at server logs for latest changes

5. **If still showing old version**:
   - Check that `server/dist/` has the latest files
   - Verify deployment logs show build completed
   - Ensure `npm run build` was actually executed
   - Check if there's a CDN caching the old files

### Problem: Build failed during deployment

1. **Check build logs** in your deployment service
2. **Ensure Node.js 18+** is being used
3. **Run locally** to verify: `npm run clean && npm run build`
4. **Check server/dist exists** and has `index.html`

### Problem: Application starts but WebSockets fail

1. Verify `VITE_SERVER_URL` is set correctly on client-side
2. Check that your deployment allows WebSocket connections
3. Some hosting (like early Vercel) doesn't support persistent WebSockets
4. Try a different hosting service (Railway, Render recommended)

## Testing Deployment

After deployment, test:
1. The app loads
2. WebSocket connections work (try creating a room)
3. Multiple players can join rooms
4. Game mechanics work correctly (dice roll, token movement)
5. All UI updates are present (check for your latest changes)

- **WebSocket issues**: Ensure the hosting platform supports WebSockets
- **CORS errors**: Check that Socket.io CORS is configured correctly
- **Static files not loading**: Verify the `dist` folder is properly copied
- **Port issues**: Use the `PORT` environment variable set by the platform