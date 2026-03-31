const fs = require('fs');
const path = require('path');

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`✓ Removed ${dir}`);
  }
}

console.log('Cleaning build artifacts...');
removeDir(path.join(__dirname, '../client/dist'));
removeDir(path.join(__dirname, '../server/dist'));
console.log('Clean complete!');
