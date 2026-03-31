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
      // Create destination directory first
      fs.mkdirSync(destPath, { recursive: true });
      
      // Then recursively copy all items
      fs.readdirSync(srcPath).forEach(file => {
        copy(
          path.join(srcPath, file),
          path.join(destPath, file)
        );
      });
    } else {
      // Ensure parent directory exists before copying file
      const destDir = path.dirname(destPath);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }

  copy(src, dest);
  
  // Verify the copy
  const filesCount = countFiles(dest);
  console.log(`✓ Copied ${src} to ${dest} (${filesCount} files)`);
}

function countFiles(dir) {
  let count = 0;
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      count += countFiles(itemPath);
    } else {
      count += 1;
    }
  });
  
  return count;
}

console.log('Copying client dist to server...');
const clientDist = path.join(__dirname, '../client/dist');
const serverDist = path.join(__dirname, '../server/dist');

if (!fs.existsSync(clientDist)) {
  console.error(`✗ Error: ${clientDist} does not exist!`);
  console.error(`Current directory: ${__dirname}`);
  process.exit(1);
}

console.log(`Source: ${clientDist}`);
console.log(`Destination: ${serverDist}`);
copyDir(clientDist, serverDist);
console.log('Copy complete!');
