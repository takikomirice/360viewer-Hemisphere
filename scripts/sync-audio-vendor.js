const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const version = '1.50.8';
const esbuildVersion = '0.25.6';
const appRelativePath = 'app.html';
const audioVendorEntrySource = [
  "import { canEncodeAudio, BufferTarget, Output, Mp3OutputFormat, AudioBufferSource } from 'mediabunny';",
  "import { registerMp3Encoder } from '@mediabunny/mp3-encoder';",
  'globalThis.Mediabunny = { canEncodeAudio, BufferTarget, Output, Mp3OutputFormat, AudioBufferSource };',
  'globalThis.MediabunnyMp3Encoder = { registerMp3Encoder };'
].join('\n');
const vendorRegion = {
  name: 'audio vendor bundle',
  startMarker: 'AUDIO_VENDOR_BUNDLE_START',
  endMarker: 'AUDIO_VENDOR_BUNDLE_END'
};
const packageFiles = [
  'node_modules/mediabunny/package.json',
  'node_modules/@mediabunny/mp3-encoder/package.json'
];
const licenseFiles = [
  ['node_modules/mediabunny/LICENSE', 'vendor/mediabunny-LICENSE.txt'],
  ['node_modules/@mediabunny/mp3-encoder/LICENSE', 'vendor/mediabunny-mp3-encoder-LICENSE.txt']
];

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

function assertSafeVendorSource(name, source) {
  if (/<\/script/i.test(source)) {
    throw new Error(`${name} contains a closing script sequence and cannot be embedded safely`);
  }
}

function locateMarkedScriptRegion(appSource, region) {
  if (countOccurrences(appSource, region.startMarker) !== 1) {
    throw new Error(`${region.name} start marker must appear exactly once`);
  }
  if (countOccurrences(appSource, region.endMarker) !== 1) {
    throw new Error(`${region.name} end marker must appear exactly once`);
  }

  const markerStart = appSource.indexOf(region.startMarker);
  const markerEnd = appSource.indexOf(region.endMarker);
  if (markerStart >= markerEnd) {
    throw new Error(`${region.name} marker order is invalid`);
  }

  const markedStart = markerStart + region.startMarker.length;
  const markedSource = appSource.slice(markedStart, markerEnd);
  const prefix = markedSource.match(/^(?:\r\n|\n)<script>(?:\r\n|\n)/);
  if (!prefix || countOccurrences(markedSource, '<script>') !== 1 || countOccurrences(markedSource, '</script>') !== 1) {
    throw new Error(`${region.name} region must contain one directly wrapped script`);
  }
  const closingScriptAt = markedSource.indexOf('</script>');
  const suffix = markedSource.slice(closingScriptAt + '</script>'.length);
  if (!/^(?:\r\n|\n)$/.test(suffix)) {
    throw new Error(`${region.name} region has an invalid closing boundary`);
  }

  const contentStart = markedStart + prefix[0].length;
  const contentEnd = markedStart + closingScriptAt;
  assertSafeVendorSource(region.name, appSource.slice(contentStart, contentEnd));
  return {
    ...region,
    markerStart,
    markerEnd,
    contentStart,
    contentEnd
  };
}

function locateVendorRegion(appSource) {
  return locateMarkedScriptRegion(appSource, vendorRegion);
}

function extractAppVendorSource(appSource) {
  const region = locateVendorRegion(appSource);
  return appSource.slice(region.contentStart, region.contentEnd);
}

function updateAppVendorSource(appSource, source) {
  if (typeof source !== 'string') {
    throw new Error('Audio vendor source is required');
  }
  assertSafeVendorSource(vendorRegion.name, source);
  const region = locateVendorRegion(appSource);
  return appSource.slice(0, region.contentStart) + source + appSource.slice(region.contentEnd);
}

function readRequired(relativePath, rootDir = root) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required vendor source is missing: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath);
}

function assertPackageVersions() {
  packageFiles.forEach((packagePath) => {
    const packageJson = JSON.parse(readRequired(packagePath).toString('utf8'));
    if (packageJson.version !== version) {
      throw new Error(`${packageJson.name} must be ${version}; found ${packageJson.version}`);
    }
  });
  if (esbuild.version !== esbuildVersion) {
    throw new Error(`esbuild must be ${esbuildVersion}; found ${esbuild.version}`);
  }
}

function buildAudioVendorBundle() {
  assertPackageVersions();
  const result = esbuild.buildSync({
    stdin: {
      contents: audioVendorEntrySource,
      loader: 'js',
      resolveDir: root,
      sourcefile: 'audio-vendor-entry.js'
    },
    bundle: true,
    charset: 'utf8',
    format: 'iife',
    legalComments: 'none',
    logLevel: 'silent',
    minify: true,
    platform: 'browser',
    sourcemap: false,
    target: ['es2020'],
    treeShaking: true,
    write: false
  });
  if (!result.outputFiles || result.outputFiles.length !== 1) {
    throw new Error('Audio vendor build must produce exactly one browser bundle');
  }
  const source = result.outputFiles[0].text.replace(/\r\n/g, '\n').trimEnd() + '\n';
  assertSafeVendorSource(vendorRegion.name, source);
  return source;
}

function synchronizeVendorFiles({
  check = false,
  rootDir = root,
  buildBundle = buildAudioVendorBundle
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const source = buildBundle();
  if (typeof source !== 'string') {
    throw new Error('Audio vendor build must return a string');
  }
  assertSafeVendorSource(vendorRegion.name, source);
  const licenses = licenseFiles.map(([sourcePath, destinationPath]) => ({
    destinationPath,
    bytes: readRequired(sourcePath, resolvedRoot)
  }));
  const appPath = path.join(resolvedRoot, appRelativePath);
  const appSource = fs.readFileSync(appPath, 'utf8');
  const currentSource = extractAppVendorSource(appSource);

  if (check) {
    if (!Buffer.from(currentSource, 'utf8').equals(Buffer.from(source, 'utf8'))) {
      throw new Error('Audio vendor region is stale');
    }
    licenses.forEach(({ destinationPath, bytes }) => {
      const destination = path.join(resolvedRoot, destinationPath);
      if (!fs.existsSync(destination) || !bytes.equals(fs.readFileSync(destination))) {
        throw new Error(`Vendor license is missing or stale: ${destinationPath}`);
      }
    });
    console.log('Audio vendor region is current.');
    return;
  }

  const updatedAppSource = updateAppVendorSource(appSource, source);
  if (updatedAppSource !== appSource) {
    fs.writeFileSync(appPath, updatedAppSource, 'utf8');
  }
  licenses.forEach(({ destinationPath, bytes }) => {
    const destination = path.join(resolvedRoot, destinationPath);
    if (!fs.existsSync(destination) || !bytes.equals(fs.readFileSync(destination))) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, bytes);
    }
  });
  console.log('Audio vendor region synchronized.');
}

if (require.main === module) {
  synchronizeVendorFiles({ check: process.argv.includes('--check') });
}

module.exports = {
  audioVendorEntrySource,
  buildAudioVendorBundle,
  extractAppVendorSource,
  locateVendorRegion,
  synchronizeVendorFiles,
  updateAppVendorSource,
  vendorRegion
};
