#!/usr/bin/env node
import { execSync } from 'child_process';
import { cpSync, existsSync } from 'fs';
import { join } from 'path';

console.log('Building Ludo Online...');

// Build the client
console.log('Building client...');
execSync('cd client && npm run build', { stdio: 'inherit' });

// Copy dist to server
console.log('Copying client build to server...');
const clientDist = join(process.cwd(), 'client', 'dist');
const serverDist = join(process.cwd(), 'server', 'dist');

if (existsSync(serverDist)) {
  execSync(`rmdir /s /q "${serverDist}"`, { stdio: 'inherit' });
}

cpSync(clientDist, serverDist, { recursive: true });

console.log('Build complete! Run "npm start" in the server directory to start the application.');