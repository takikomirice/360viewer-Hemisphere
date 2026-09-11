'use strict';

// Pixel coordinates follow Pannellum's createCube(): front is yaw 0,
// right is yaw +90, and image rows run from the zenith to the nadir.
function cubeDirection(face, u, v) {
  switch (face) {
    case 'f': return [u, -v, 1];
    case 'r': return [1, -v, -u];
    case 'b': return [-u, -v, -1];
    case 'l': return [-1, -v, u];
    case 'u': return [u, 1, v];
    case 'd': return [u, -1, -v];
    default: throw new Error('Unknown cube face');
  }
}

function directionToPixel([x, y, z], width, height) {
  return {
    x: (Math.atan2(x, z) / (2 * Math.PI) + .5) * width - .5,
    y: (.5 - Math.asin(y / Math.hypot(x, y, z)) / Math.PI) * height - .5
  };
}

function sampleBilinear(data, width, height, x, y) {
  x = ((x % width) + width) % width;
  y = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(x), x1 = (x0 + 1) % width;
  const y0 = Math.floor(y), y1 = Math.min(height - 1, y0 + 1);
  const dx = x - x0, dy = y - y0;
  const result = [];
  for (let c = 0; c < 3; c++) {
    const top = data[(y0 * width + x0) * 3 + c] * (1 - dx) + data[(y0 * width + x1) * 3 + c] * dx;
    const bottom = data[(y1 * width + x0) * 3 + c] * (1 - dx) + data[(y1 * width + x1) * 3 + c] * dx;
    result.push(Math.round(top * (1 - dy) + bottom * dy));
  }
  return result;
}

function project(data, sourceWidth, sourceHeight, width, height, direction) {
  const output = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = directionToPixel(direction(x, y), sourceWidth, sourceHeight);
      const color = sampleBilinear(data, sourceWidth, sourceHeight, pixel.x, pixel.y);
      const offset = (y * width + x) * 3;
      output[offset] = color[0]; output[offset + 1] = color[1]; output[offset + 2] = color[2];
    }
  }
  return output;
}

function projectCubeFace(data, width, height, face, size) {
  return project(data, width, height, size, size, (x, y) =>
    cubeDirection(face, 2 * (x + .5) / size - 1, 2 * (y + .5) / size - 1));
}

function projectThumbnail(data, sourceWidth, sourceHeight, config) {
  const {thumbnailWidth: width, thumbnailHeight: height, hfov, yaw, pitch} = config;
  const tan = Math.tan(hfov * Math.PI / 360);
  const cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180);
  const cp = Math.cos(pitch * Math.PI / 180), sp = Math.sin(pitch * Math.PI / 180);
  return project(data, sourceWidth, sourceHeight, width, height, (x, y) => {
    const right = (2 * (x + .5) / width - 1) * tan;
    const up = (1 - 2 * (y + .5) / height) * tan * height / width;
    return [right * cy + (cp - up * sp) * sy, up * cp + sp, -right * sy + (cp - up * sp) * cy];
  });
}

module.exports = {cubeDirection, directionToPixel, sampleBilinear, projectCubeFace, projectThumbnail};
