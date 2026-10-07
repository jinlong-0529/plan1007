import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
// 交付源码排除依赖、安装包、Git 历史及用户数据，不携带任何密钥。
fs.mkdirSync('delivery',{recursive:true});
const output=fs.createWriteStream('delivery/DeliveryAssistant-Source-1.0.0.zip');
const archive=archiver('zip',{zlib:{level:9}});archive.pipe(output);
const finished=new Promise((resolve,reject)=>{output.on('close',resolve);output.on('error',reject);archive.on('error',reject);});
for(const name of ['desktop','scripts','build','docs','tests']) archive.directory(name,name);
for(const name of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','index.html','server.mjs','schema.sql','README.md','.env.example','.gitignore']) {
  if(fs.existsSync(name)) archive.file(path.resolve(name),{name});
}
await archive.finalize();
await finished;
console.log('完整源码包已生成。');
