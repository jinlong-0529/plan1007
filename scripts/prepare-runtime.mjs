import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const manifest=require('electron/package.json');
const electronDirectory=path.dirname(require.resolve('electron/package.json'));
const vendorRequire=createRequire(path.join(electronDirectory,'install.js'));
const extract=vendorRequire('extract-zip');
const name=`electron-v${manifest.version}-win32-x64.zip`;
const zip=path.resolve('.build-cache',name);
const buffer=await fs.readFile(zip);
const expected=require('electron/checksums.json')[name];
// 镜像仅改变下载位置，运行时必须与 Electron 随包的官方哈希一致。
if(!expected || crypto.createHash('sha256').update(buffer).digest('hex')!==expected) throw new Error('运行时校验失败，请重新下载官方文件。');
await extract(zip,{dir:path.join(electronDirectory,'dist')});
await fs.writeFile(path.join(electronDirectory,'path.txt'),'electron.exe');
console.log('Electron Windows 运行时官方 SHA256 校验与解压完成。');
