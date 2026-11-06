const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const fse = require('fs-extra');

const zipName =  `Release-${getCurrentFormattedDate()}.zip`;
const rootFolder = path.dirname(__dirname); // current working directory
const outputDir = path.join(path.dirname(rootFolder), 'Releases TUID-BACKEND');
const outputFile = path.join(outputDir, zipName);

const itemsToZip = [
'.platform',
'config',
'html',
'middleware',
'package-lock.json',
'package.json',
'resources',
'rota.code',
'routes',
'scripts',
'server.js',
'services',
'startup',
'uploads',
'utils']

console.log("Creting zip release file", { root: rootFolder, outputDir: outputDir, outputFile: outputFile, itemsToZip: itemsToZip})

// Create a file to stream archive data to
const output = fs.createWriteStream(outputFile);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`ZIP file created: ${outputFile}`);
});

archive.on('error', (err) => {
  throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Function to add files and folders recursively
function addToArchive(filePath, archive, rootFolder) {
    if (fs.statSync(filePath).isDirectory()) {
      // If it's a directory, recursively add its contents
      const files = fs.readdirSync(filePath);
      files.forEach(file => {
        addToArchive(path.join(filePath, file), archive, rootFolder);
      });
    } else {
      // If it's a file, add it to the archive
      archive.file(filePath, { name: path.relative(rootFolder, filePath) });
    }
  }

  // Add files and folders to the archive
itemsToZip.forEach(item => {
    const itemPath = path.join(rootFolder, item);
    if (fs.existsSync(itemPath)) {
      addToArchive(itemPath, archive, rootFolder);
    } else {
      console.warn(`File or folder not found: ${itemPath}`);
    }
  });
  

// // Finalize the archive
archive.finalize();


function getCurrentFormattedDate() {
    const now = new Date();
    const padZero = (num) => num.toString().padStart(2, '0');
    const year = now.getFullYear().toString().slice(-2); // Get last 2 digits of year
    const month = padZero(now.getMonth() + 1); // Months are 0-based
    const day = padZero(now.getDate());
    const hours = padZero(now.getHours());
    const minutes = padZero(now.getMinutes());
    const seconds = padZero(now.getSeconds());
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }
  
  