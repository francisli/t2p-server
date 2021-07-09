const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');
const StreamZip = require('node-stream-zip');

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    fetch(url).then((res) => {
      file.on('error', (err) => reject(err));
      file.on('finish', () => resolve());
      res.body.pipe(file);
    });
  });
}

function unzip(filePath, tmpDir) {
  return new Promise((resolve, reject) => {
    const zip = new StreamZip({ file: filePath });
    zip.on('error', (err) => reject(err));
    zip.on('ready', () => {
      /// unzip the first file...
      for (const entry of Object.values(zip.entries())) {
        const destPath = path.resolve(tmpDir.name, entry.name);
        zip.extract(entry.name, destPath, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(destPath);
          }
          zip.close();
        });
        break;
      }
    });
  });
}

module.exports = {
  download,
  unzip,
};
