import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {Store,today}=require('../desktop/store.cjs');
const {parseFile,report,exportFile}=require('../desktop/files.cjs');
const {importPlane}=require('../desktop/plane.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-tests-'));
const task={title:'交付验收',project:'测试项目',due:today(),priority:'高',status:'待处理'};

test('记录重启保留、状态完成日期、无效数据与备份恢复',()=>{
  const store=new Store(path.join(directory,'store'));
  const item=store.create('tasks',task);
  store.update('tasks',item.id,{status:'已完成'});
  assert.equal(new Store(store.directory).data.tasks[0].completedDate,today());
  assert.throws(()=>store.update('tasks',item.id,{status:'错误状态'}),/状态不正确/);
  assert.throws(()=>store.create('tasks',{...task,title:''}),/必填/);
  const backup=structuredClone(store.data);
  store.create('knowledge',{title:'部署经验',content:'排查端口与权限'});
  store.restore(backup);
  assert.equal(store.data.knowledge.length,0);
  assert.ok(fs.existsSync(store.file+'.bak'));
  const edited=store.edit('tasks',item.id,{title:'已修改的验收'});
  assert.equal(edited.id,item.id);assert.equal(edited.completedDate,today());
  assert.equal(new Store(store.directory).data.tasks.length,1);
  store.remove('tasks',item.id);assert.equal(new Store(store.directory).data.tasks.length,0);
  const yesterday={...item,completedDate:'2020-01-01'};
  const text=report({...store.data,tasks:[yesterday]},'daily');
  assert.ok(!text.includes('- 测试项目：交付验收'));
});

test('中文知识的 DOCX/XLSX 导出后能够重新解析，Markdown 保留原文',async()=>{
  const data={version:1,tasks:[],issues:[],bugs:[],knowledge:[{id:'test',title:'解决方案',content:'先备份，再检查服务端口。',date:today()}]};
  for(const format of ['docx','xlsx','md']) {
    const file=path.join(directory,`中文方案.${format}`);
    await exportFile(data,'knowledge',format,file);
    const text=await parseFile(file);
    assert.match(text,/解决方案/);assert.match(text,/先备份/);
  }
  const daily=path.join(directory,'日报.docx');
  await exportFile(data,'daily','docx',daily);
  assert.match(await parseFile(daily),/工作日报/);
});

test('Plane 分页导入幂等，状态映射正确，网络失败不写入半份数据',async()=>{
  const store=new Store(path.join(directory,'plane'));
  const calls=[];
  const settings={url:'https://plane.example.test',workspace:'delivery',project:'uuid',key:'secret',name:'客户项目'};
  const fetcher=async(url,options)=>{
    calls.push(url);assert.equal(options.headers['X-API-Key'],'secret');
    const data=url.includes('/states/')?[{id:'done',group:'completed'}]:url.includes('cursor=next')?{results:[{id:'2',name:'问题二',state:'done'}],next_page_results:false}:{results:[{id:'1',name:'问题一',state:'done'}],next_page_results:true,next_cursor:'next'};
    return {ok:true,json:async()=>data};
  };
  await importPlane(store,settings,fetcher);await importPlane(store,settings,fetcher);
  assert.equal(store.data.issues.length,2);assert.equal(store.data.issues[0].status,'已解决');
  const original=JSON.stringify(store.data);
  await assert.rejects(()=>importPlane(store,settings,async()=>({ok:false,status:401})),/401/);
  assert.equal(JSON.stringify(store.data),original);
});
