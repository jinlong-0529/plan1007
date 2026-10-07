import fs from 'node:fs/promises';
import sharp from 'sharp';
// ICO 目录采用 PNG 图像块，保留每个尺寸的透明边缘。
const sizes = [16, 32, 48, 256];
const images = await Promise.all(sizes.map(size => sharp('build/icon.svg').resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const p = 6 + i * 16;
  header[p] = sizes[i] === 256 ? 0 : sizes[i]; header[p + 1] = header[p];
  header.writeUInt16LE(1, p + 4); header.writeUInt16LE(32, p + 6);
  header.writeUInt32LE(images[i].length, p + 8); header.writeUInt32LE(offset, p + 12);
  offset += images[i].length;
  await fs.writeFile(`build/icon-${sizes[i]}.png`, images[i]);
}
await fs.writeFile('build/icon.ico', Buffer.concat([header, ...images]));
console.log('已生成 16、32、48、256 像素应用图标。');
