const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  // Remove destination if it exists
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  // Create destination directory
  fs.mkdirSync(dest, { recursive: true });

  // Copy all files recursively
  function copy(srcPath, destPath) {
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      fs.readdirSync(srcPath).forEach(file => {
        copy(
          path.join(srcPath, file),
          path.join(destPath, file)
        );
      });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  copy(src, dest);
  console.log(`✓ Copied ${src} to ${dest}`);
}

console.log('Copying client dist to server...');
const clientDist = path.join(__dirname, '../client/dist');
const serverDist = path.join(__dirname, '../server/dist');

if (!fs.existsSync(clientDist)) {
  console.error(`✗ Error: ${clientDist} does not exist!`);
  process.exit(1);
}

copyDir(clientDist, serverDist);
console.log('Copy complete!');
