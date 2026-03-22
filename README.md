# Ludo Online (React + Socket.IO)

Realtime web-based Ludo with:
- 2-4 active players
- 4 colors (random assignment)
- 6-digit room code
- Username-only join (letters only, max 20, unique in room)
- Spectator joins after game starts
- Reconnect support (60s grace)
- 20s turn timer
- Classic movement and dice rules (includes extra turn on 6 and 3 consecutive 6s turn loss)
- Minimal playful UI, token movement animations, dice animation, sound toggle

## Project Structure

- `client/` React app (Vite)
- `server/` Node.js + Socket.IO game server
- `.tools/node/` portable Node runtime used in this workspace

## Run Locally (Current Workspace)

Because Node is not installed globally in this environment, use the portable runtime:

1. Start backend:

```powershell
cd d:\Projects\260308LudoOnline\server
..\.tools\node\node.exe src\index.js
```

2. Start frontend (new terminal):

```powershell
cd d:\Projects\260308LudoOnline\client
$env:PATH = "d:\Projects\260308LudoOnline\.tools\node;" + $env:PATH
..\.tools\node\npm.cmd run dev
```

3. Open the app at:

- `http://localhost:5173`

## If You Install Node Globally

After installing Node.js, from repo root you can run:

```powershell
npm install
npm --prefix server install
npm --prefix client install
npm run dev  # runs both client and server concurrently
```

## Production Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

The app will be available on the configured port (default: 4000).

### Deployment Platforms

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on deploying to:
- Railway (recommended)
- Render
- Heroku
- Vercel
- DigitalOcean App Platform
- Docker

### Docker Deployment

```bash
docker build -t ludo-online .
docker run -p 4000:4000 ludo-online
```
npm run dev
```

## Notes

- Any player can click `Start Game` in lobby once at least 2 players are present.
- Late joiners become spectators.
- If an active player disconnects for more than 60 seconds, they are removed from active play.
