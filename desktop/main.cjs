const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store.cjs');
const { parseFile, exportFile } = require('./files.cjs');
const { importPlane } = require('./plane.cjs');
let window, store;
app.commandLine.appendSwitch('lang','zh-CN');
app.setPath('userData',path.join(app.getPath('appData'),'delivery-engineer-assistant'));
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', path.join(process.cwd(),'.build-cache',app.isPackaged?'smoke-packaged':'smoke-source'));
// 只允许本地页面访问 IPC，并统一转成中文错误，不向 UI 透出底层堆栈。
function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return { error:'请求来源不受信任。' };
    try { return { result:await callback(...args) }; }
    catch (error) {
      console.error(error);
      const message = /[\u4e00-\u9fff]/.test(error.message)?error.message:'操作失败，请检查文件格式、网络连接及磁盘权限后重试。';
      return { error:message };
    }
  });
}
async function createWindow() {
  window = new BrowserWindow({width:1280,height:900,minWidth:1024,minHeight:768,title:'交付工程师个人助手',
    icon:path.join(__dirname,'../build/icon.ico'),show:!smoke,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => callback({responseHeaders:{...details.responseHeaders,
    'Content-Security-Policy':["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'"]}}));
  await window.loadFile(path.join(__dirname,'../index.html'));
  if (smoke) {
    try {
      window.setSize(1024,768);
      const result = await window.webContents.executeJavaScript(`(async()=>{ await loadData(); const errors=[]; const reply=await window.desktop.request('/api/tasks',{method:'POST',body:JSON.stringify({title:'桌面冒烟验证',project:'本地测试',due:localDate(),priority:'高',status:'待处理'})}); if(reply.error) errors.push(reply.error); await loadData(); if(!data.tasks.some(t=>t.title==='桌面冒烟验证'))errors.push('记录未呈现'); for(const id of routes){showView(id); await new Promise(r=>setTimeout(r,30)); if(document.documentElement.scrollWidth>innerWidth) errors.push(id+'：横向溢出');} return {title:document.title,bridge:!!window.desktop,width:innerWidth,height:innerHeight,errors}; })()`);
      fs.writeFileSync(path.join(app.getPath('userData'),'smoke-result.json'),JSON.stringify(result,null,2));
      await window.webContents.executeJavaScript("showView('dashboard'); true");
      await window.webContents.executeJavaScript("new Promise(resolve=>setTimeout(resolve,120))");
      fs.writeFileSync(path.join(app.getPath('userData'),'desktop-preview.png'),(await window.webContents.capturePage()).toPNG());
      if (!result.bridge || result.errors.length) throw new Error('桌面页面验证失败。');
      app.exit(0);
    } catch(error) { console.error(error); app.exit(1); }
  }
}
app.whenReady().then(async()=>{
  try { store = new Store(path.join(app.getPath('userData'),'data')); }
  catch(error) { dialog.showErrorBox('数据读取失败',error.message); app.exit(1); return; }
  handle('records', async(url, options={}) => {
    if (url==='/api/data') return store.data;
    const match = /^\/api\/(knowledge|tasks|issues|bugs)(?:\/([^/]+))?$/.exec(url);
    if (!match) throw new Error('接口不存在。');
    let body; try { body=JSON.parse(options.body || '{}'); } catch { throw new Error('请求格式不正确。'); }
    if (options.method==='POST' && !match[2]) return store.create(match[1],body);
    if (options.method==='PATCH' && match[2]) return store.update(match[1],decodeURIComponent(match[2]),body);
    if (options.method==='PUT' && match[2]) return store.edit(match[1],decodeURIComponent(match[2]),body);
    if (options.method==='DELETE' && match[2]) {
      const confirmation=await dialog.showMessageBox(window,{type:'question',title:'删除记录',message:'确定删除这条记录？建议先备份重要资料。',buttons:['取消','删除'],defaultId:0,cancelId:0});
      if(confirmation.response!==1)return {cancelled:true};
      return store.remove(match[1],decodeURIComponent(match[2]));
    }
    throw new Error('操作不受支持。');
  });
  handle('import-files', async()=>{
    const selection = await dialog.showOpenDialog(window,{title:'导入知识文件',properties:['openFile','multiSelections'],filters:[{name:'知识文件',extensions:['docx','xlsx','md','markdown','txt']}]});
    if (selection.canceled) return {cancelled:true};
    const results=[];
    for (const file of selection.filePaths) {
      try {
        const content=await parseFile(file);
        if (!content.trim()) throw new Error('文件没有可提取的文字内容。');
        const sourceDirectory=path.join(store.directory,'attachments'); fs.mkdirSync(sourceDirectory,{recursive:true});
        const name=`${require('node:crypto').randomUUID()}${path.extname(file)}`;
        fs.copyFileSync(file,path.join(sourceDirectory,name));
        store.create('knowledge',{title:path.basename(file,path.extname(file)),content,tags:'文件导入',source:path.basename(file),attachment:name});
        results.push({file:path.basename(file),ok:true});
      } catch { results.push({file:path.basename(file),ok:false,error:'导入失败，请检查格式、文件大小（20 MB 内）与内容。'}); }
    }
    return {results};
  });
  handle('export-file', async(type,format)=>{
    if (!['daily','knowledge','tasks','issues','bugs'].includes(type) || !['md','docx','xlsx'].includes(format) || type==='daily' && format==='xlsx') throw new Error('导出类型或格式不正确。');
    const labels={daily:'工作日报',knowledge:'知识解决方案',tasks:'任务清单',issues:'项目问题',bugs:'问题处理方案'};
    const selection=await dialog.showSaveDialog(window,{title:'导出文件',defaultPath:`${labels[type]}-${new Date().toISOString().slice(0,10)}.${format}`,filters:[{name:'导出文件',extensions:[format]}]});
    if (selection.canceled) return {cancelled:true};
    await exportFile(store.data,type,format,selection.filePath); return {file:selection.filePath};
  });
  handle('backup', async()=>{
    const selection=await dialog.showSaveDialog(window,{title:'备份工作数据（含原文件）',defaultPath:'交付助手备份.json',filters:[{name:'数据备份',extensions:['json']}]});
    if (selection.canceled) return {cancelled:true};
    const attachments={};
    for(const record of store.data.knowledge) if(record.attachment) {
      const name=path.basename(record.attachment); attachments[name]=fs.readFileSync(path.join(store.directory,'attachments',name)).toString('base64');
    }
    fs.writeFileSync(selection.filePath,JSON.stringify({...store.data,attachments},null,2)); return {file:selection.filePath};
  });
  handle('restore', async()=>{
    const selection=await dialog.showOpenDialog(window,{title:'选择备份文件',properties:['openFile'],filters:[{name:'数据备份',extensions:['json']}]});
    if(selection.canceled) return {cancelled:true};
    let data; try {data=JSON.parse(fs.readFileSync(selection.filePaths[0],'utf8'));} catch {throw new Error('备份文件无法解析。');}
    store.validate(data);
    const answer=await dialog.showMessageBox(window,{type:'question',title:'恢复备份',message:'将替换当前工作数据。恢复前会自动保留当前完整备份，是否继续？',buttons:['取消','恢复'],defaultId:0,cancelId:0});
    if(answer.response!==1) return {cancelled:true};
    const attachments=data.attachments || {};
    for(const name of Object.keys(attachments)) if(path.basename(name)!==name || !/^[a-f0-9-]+\.(docx|xlsx|md|markdown|txt)$/i.test(name) || typeof attachments[name]!=='string') throw new Error('备份附件格式不正确。');
    for(const record of data.knowledge) if(record.attachment && !attachments[record.attachment]) throw new Error('备份缺少原文件，请选择完整备份。');
    const directory=path.join(store.directory,'attachments');fs.mkdirSync(directory,{recursive:true});
    fs.copyFileSync(store.file,path.join(store.directory,`恢复前-${Date.now()}.json`));
    for(const [name,base64] of Object.entries(attachments)) fs.writeFileSync(path.join(directory,name),Buffer.from(base64,'base64'));
    delete data.attachments; store.restore(data); return {ok:true};
  });
  handle('plane-import', settings=>importPlane(store,settings));
  await createWindow();
}).catch(error=>{console.error(error);dialog.showErrorBox('启动失败','应用无法启动，请确认磁盘可写或重新安装。');app.exit(1);});
app.on('window-all-closed',()=>app.quit());
