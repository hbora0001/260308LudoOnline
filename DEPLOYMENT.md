# Ludo Online - Deployment Guide

This guide shows how to deploy the Ludo Online game to various hosting platforms.

## Prerequisites

1. Build the application:
   ```bash
   npm run build
   ```

2. The built files will be in `server/dist/`

## Deployment Options

### 1. Railway (Recommended)

Railway automatically detects Node.js apps and provides free tier.

1. Go to [Railway.app](https://railway.app)
2. Connect your GitHub repository
3. Railway will automatically detect and deploy
4. Set environment variables if needed:
   - `PORT` (automatically set by Railway)

### 2. Render

1. Go to [Render.com](https://render.com)
2. Create a new Web Service
3. Connect your repository
4. Set build command: `npm run build`
5. Set start command: `npm start`
6. Set working directory: `server`

### 3. Heroku

1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create your-app-name`
4. Set Node.js buildpack: `heroku buildpacks:set heroku/nodejs`
5. Deploy:
   ```bash
   git push heroku main
   ```

### 4. Vercel

For Vercel, you need to configure it as a monorepo:

1. Create `vercel.json`:
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "server/src/index.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "server/src/index.js"
       }
     ]
   }
   ```

2. Deploy: `vercel`

### 5. DigitalOcean App Platform

1. Go to DigitalOcean App Platform
2. Create a new app from GitHub
3. Set resource type to "Web Service"
4. Configure:
   - Source directory: `server`
   - Run command: `npm start`
   - Build command: `npm run build` (in root directory)

### 6. AWS/GCP/Azure

For cloud providers, deploy as a Node.js application with the built files in `server/dist/`.

## Environment Variables

Most platforms automatically set `PORT`. If you need to override the server URL:

- `VITE_SERVER_URL`: Override the server URL (useful for development)

## Testing Deployment

After deployment, test:
1. The app loads
2. WebSocket connections work
3. Multiple players can join rooms
4. Game mechanics work correctly

## Troubleshooting

- **WebSocket issues**: Ensure the hosting platform supports WebSockets
- **CORS errors**: Check that Socket.io CORS is configured correctly
- **Static files not loading**: Verify the `dist` folder is properly copied
- **Port issues**: Use the `PORT` environment variable set by the platform