const { today } = require('./store.cjs');
// Plane 采用单向导入快照。远端凭据只驻留内存，不写入用户数据文件。
async function importPlane(store, settings, fetcher = fetch) {
  let base;
  try { base = new URL(settings.url); } catch { throw new Error('请输入有效的 Plane 服务地址。'); }
  if (!['http:','https:'].includes(base.protocol) || base.username || base.password) throw new Error('Plane 地址必须是 HTTP 或 HTTPS，且不能包含账号密码。');
  const slug = settings.workspace?.trim(), project = settings.project?.trim(), key = settings.key?.trim();
  if (!slug || !project || !key) throw new Error('请填写工作区标识、项目 ID 和 API 密钥。');
  const prefix = `${base.origin}${base.pathname.replace(/\/$/,'')}/api/v1/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}`;
  async function get(endpoint) {
    const response = await fetcher(endpoint, { headers:{'X-API-Key':key},signal:AbortSignal.timeout(20000), redirect:'error' });
    if (!response.ok) throw new Error(`Plane 返回 ${response.status}，请检查服务地址、版本及 API 权限。`);
    return response.json();
  }
  const stateResponse = await get(`${prefix}/states/`);
  const states = new Map((Array.isArray(stateResponse)?stateResponse:stateResponse.results || []).map(state=>[state.id,state.group]));
  const records = [];
  let cursor = '';
  const seenCursors = new Set();
  for (let page=0; page<100; page++) {
    const response = await get(`${prefix}/issues/?per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}`:''}`);
    records.push(...(Array.isArray(response)?response:response.results || []));
    if (!response.next_page_results) break;
    cursor = response.next_cursor;
    if (!cursor || seenCursors.has(cursor) || page===99) throw new Error('Plane 分页数据异常或数量过多，本次未导入。');
    seenCursors.add(cursor);
  }
  const candidate = structuredClone(store.data);
  for (const item of records) {
    const id = `plane:${base.origin}:${slug}:${project}:${item.id}`;
    const group = typeof item.state==='object'?item.state?.group:states.get(item.state);
    const status = ['completed','cancelled'].includes(group)?'已解决':group==='started'?'跟进中':'待确认';
    const previous = candidate.issues.find(record=>record.id===id);
    const record = { ...previous,id,title:item.name || '未命名问题',project:settings.name?.trim() || project,
      source:'Plane',status,date:today(),updatedAt:Math.floor(Date.parse(item.updated_at || new Date().toISOString())/1000),
      remoteId:item.id,completedDate:status==='已解决' && item.completed_at && Number.isFinite(Date.parse(item.completed_at))
        ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(item.completed_at)) : null };
    if (previous) Object.assign(previous,record); else candidate.issues.unshift(record);
  }
  store.restore(candidate); return { count:records.length };
}
module.exports = { importPlane };
