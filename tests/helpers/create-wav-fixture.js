const fs = require('node:fs');
const path = require('node:path');

function createWavBuffer(options = {}) {
  const sampleRate = options.sampleRate || 8000;
  const duration = options.duration || 2.5;
  const silent = Boolean(options.silent);
  const amplitude = options.amplitude == null ? 0.45 : options.amplitude;
  const channels = options.channels || 1;
  const frames = Math.floor(sampleRate * duration);
  const dataSize = frames * channels * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = silent ? 0 : Math.round(Math.sin(frame / sampleRate * Math.PI * 2 * 440 + channel * Math.PI / 3) * amplitude * 32767);
      buffer.writeInt16LE(value, 44 + (frame * channels + channel) * 2);
    }
  }
  return buffer;
}

function writeWavFixture(directory, name, options) {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, createWavBuffer(options));
  return filePath;
}

module.exports = { createWavBuffer, writeWavFixture };
