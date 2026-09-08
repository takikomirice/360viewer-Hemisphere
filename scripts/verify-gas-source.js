const fs = require('node:fs');
const path = require('node:path');

const sourceFiles = ['appsscript.json', 'Code.js', 'index.html', 'styles.html', 'app.html'];

function normalize(source) {
  return source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimEnd();
}

function verifyGasSource(referenceDir, downloadedDir) {
  return sourceFiles.map((name) => {
    const reference = fs.readFileSync(path.join(referenceDir, name), 'utf8');
    const destination = path.join(downloadedDir, name);
    if (!fs.existsSync(destination)) return { name, status: 'missing' };
    const downloaded = fs.readFileSync(destination, 'utf8');
    return { name, status: normalize(reference) === normalize(downloaded) ? 'match' : 'different' };
  });
}

if (require.main === module) {
  const downloadedDir = process.argv[2];
  if (!downloadedDir) {
    console.error('Usage: node scripts/verify-gas-source.js <directory downloaded with clasp>');
    process.exitCode = 1;
  } else {
    try {
      const results = verifyGasSource(path.resolve(__dirname, '..'), path.resolve(downloadedDir));
      for (const result of results) console.log(`${result.status}: ${result.name}`);
      if (results.some((result) => result.status !== 'match')) process.exitCode = 1;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { verifyGasSource };
