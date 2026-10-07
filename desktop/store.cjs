const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const types = ['knowledge', 'tasks', 'issues', 'bugs'];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
class Store {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'records.json');
    fs.mkdirSync(directory, { recursive: true });
    if (fs.existsSync(this.file)) {
      try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); this.validate(this.data); }
      catch { throw new Error('本地数据文件无法读取，请使用备份恢复。原文件已保留。'); }
    } else {
      this.data = { version: 1, knowledge: [], tasks: [], issues: [], bugs: [] };
      this.save();
    }
  }
  validate(data) {
    if (!data || data.version !== 1 || types.some(type => !Array.isArray(data[type]))) throw new Error('备份格式不正确。');
    for (const type of types) for (const record of data[type]) {
      if (!record || typeof record.id !== 'string' || typeof record.title !== 'string') throw new Error('备份记录格式不正确。');
    }
  }
  save() {
    // 先备份旧版本，再原子替换，避免中途退出留下半个 JSON 文件。
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.bak`);
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temp, this.file);
  }
  create(type, body, persist=true) {
    if (!types.includes(type)) throw new Error('记录类型不正确。');
    const fields = {
      knowledge: ['title', 'content'], tasks: ['title', 'project', 'due'],
      issues: ['title', 'project', 'source'], bugs: ['title', 'project', 'symptom', 'root', 'prevention']
    }[type];
    if (fields.some(field => typeof body[field] !== 'string' || !body[field].trim())) throw new Error('请完整填写必填字段。');
    if (Object.values(body).some(value => typeof value === 'string' && value.length > 2000000)) throw new Error('内容过长，请分成多个文件导入。');
    if (type === 'tasks' && (!/^\d{4}-\d{2}-\d{2}$/.test(body.due) || !['高','中','低'].includes(body.priority) || !['待处理','进行中','已完成'].includes(body.status))) throw new Error('任务日期、优先级或状态不正确。');
    if (type === 'issues' && !['待确认','跟进中','已解决'].includes(body.status)) throw new Error('问题状态不正确。');
    const record = { ...body, id: crypto.randomUUID(), date: body.date || today(), createdAt: Date.now(), updatedAt: Math.floor(Date.now() / 1000) };
    record.completedDate = record.status === '已完成' || record.status === '已解决' ? today() : null;
    this.data[type].unshift(record);
    if(persist) {
      try {this.save();} catch(error) {this.data[type].shift();throw error;}
    }
    return record;
  }
  update(type, id, body) {
    const record = this.data[type]?.find(item => item.id === id);
    if (!record) throw new Error('记录不存在。');
    if (body.status) {
      const allowed = type === 'tasks' ? ['待处理','进行中','已完成'] : type === 'issues' ? ['待确认','跟进中','已解决'] : [];
      if (!allowed.includes(body.status)) throw new Error('状态不正确。');
      record.status = body.status;
      record.completedDate = ['已完成','已解决'].includes(body.status) ? today() : null;
    }
    record.updatedAt = Math.floor(Date.now()/1000); this.save(); return record;
  }
  edit(type, id, body) {
    const index=this.data[type]?.findIndex(item=>item.id===id);
    if(index == null || index<0) throw new Error('记录不存在。');
    const previous=structuredClone(this.data);
    const old=this.data[type][index];
    try {
      const updated=this.create(type,{...old,...body},false);
      this.data[type]=this.data[type].filter(item=>item.id!==old.id && item.id!==updated.id);
      updated.id=old.id;updated.createdAt=old.createdAt;
      if(old.status===updated.status) updated.completedDate=old.completedDate;
      this.data[type].splice(index,0,updated);this.save();return updated;
    } catch(error) {this.data=previous;throw error;}
  }
  remove(type,id) {
    if(!types.includes(type) || !this.data[type].some(item=>item.id===id))throw new Error('记录不存在。');
    this.data[type]=this.data[type].filter(item=>item.id!==id);this.save();return {ok:true};
  }
  restore(data) { this.validate(data); this.data = data; this.save(); }
}
module.exports = { Store, today };
