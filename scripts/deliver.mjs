import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
fs.mkdirSync('delivery',{recursive:true});
const files=[
  ['release/DeliveryAssistant-Setup-1.0.0-x64.exe','DeliveryAssistant-Setup-1.0.0-x64.exe'],
  ['build/icon.ico','应用图标.ico'],
  ['docs/开发SOP.md','开发SOP.md'],
  ['docs/上线准备清单.md','上线准备清单.md']
];
for(const [source,name] of files) fs.copyFileSync(source,path.join('delivery',name));
const hashes=[];
for(const name of fs.readdirSync('delivery').filter(name=>/\.(exe|zip|ico|md)$/.test(name))) {
  hashes.push(`${crypto.createHash('sha256').update(fs.readFileSync(path.join('delivery',name))).digest('hex')}  ${name}`);
}
fs.writeFileSync('delivery/SHA256SUMS.txt',hashes.join('\r\n')+'\r\n');
console.log('五项交付文件及 SHA256 已汇集到 delivery。');
