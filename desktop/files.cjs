const fs = require('node:fs/promises');
const path = require('node:path');
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const { today } = require('./store.cjs');

async function parseFile(file) {
  if ((await fs.stat(file)).size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请拆分后导入。');
  const extension = path.extname(file).toLowerCase();
  if (['.md','.markdown','.txt'].includes(extension)) return fs.readFile(file, 'utf8');
  if (extension === '.docx') return (await mammoth.extractRawText({ path: file })).value;
  if (extension === '.xlsx') {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file);
    const sections = [];
    workbook.eachSheet(sheet => {
      const lines = [`工作表：${sheet.name}`];
      sheet.eachRow(row => lines.push(row.values.slice(1).map(cell => {
        if (cell == null) return '';
        if (typeof cell === 'object') return cell.text || cell.result || cell.richText?.map(part => part.text).join('') || JSON.stringify(cell);
        return String(cell);
      }).join(' | ')));
      sections.push(lines.join('\n'));
    });
    return sections.join('\n\n');
  }
  throw new Error('支持 DOCX、XLSX、Markdown 和 TXT；旧版 DOC/XLS 请先另存为新格式。');
}

function report(data, type) {
  const date = today();
  if (type === 'daily') {
    // 使用实际完成日期，避免把以前完成的任务计入今日日报。
    const completed = data.tasks.filter(item => item.completedDate === date && item.status === '已完成');
    const resolved = data.issues.filter(item => item.completedDate === date && item.status === '已解决');
    const active = data.tasks.filter(item => item.status !== '已完成');
    return `# 工作日报 · ${date}\n\n## 今日完成\n${completed.map(item => `- ${item.project}：${item.title}`).join('\n') || '- 暂无完成记录'}\n\n## 今日解决问题\n${resolved.map(item => `- ${item.project}：${item.title}`).join('\n') || '- 暂无解决记录'}\n\n## 待办与后续计划（请确认）\n${active.map(item => `- ${item.title}（${item.project}，${item.status}，截止 ${item.due}）`).join('\n') || '- 暂无'}\n\n## 跟进中的项目问题\n${data.issues.filter(item => item.status !== '已解决').map(item => `- ${item.project}：${item.title}（${item.status}）`).join('\n') || '- 暂无'}\n\n## 今日知识沉淀\n${data.knowledge.filter(item => item.date === date).map(item => `- ${item.title}`).join('\n') || '- 暂无'}\n\n## 需要协调与风险\n请补充客户沟通结果、当前阻塞与需要协助的事项。`;
  }
  const labels = { knowledge:'知识与解决方案', tasks:'任务清单', issues:'项目问题清单', bugs:'问题处理与复盘方案' };
  if (!labels[type]) throw new Error('导出类型不正确。');
  return `# ${labels[type]} · ${date}\n\n` + data[type].map(item => `## ${item.title}\n\n` + [
    item.project && `项目：${item.project}`, item.status && `状态：${item.status}`, item.due && `截止：${item.due}`,
    item.content, item.symptom && `现象与影响：${item.symptom}`, item.root && `根因：${item.root}`,
    item.prevention && `解决方案与预防措施：${item.prevention}`, item.tags && `标签：${item.tags}`,
    item.source && `来源：${item.source}`
  ].filter(Boolean).join('\n\n')).join('\n\n');
}
async function exportFile(data, type, format, file) {
  const text = report(data, type);
  if (format === 'md') return fs.writeFile(file, text, 'utf8');
  if (format === 'docx') {
    const paragraphs = text.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line.replace(/^#+ /,''), font:'Microsoft YaHei', bold:line.startsWith('#') })] }));
    const document = new Document({ sections: [{ children: paragraphs }] });
    return fs.writeFile(file, await Packer.toBuffer(document));
  }
  if (format === 'xlsx') {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('工作记录');
    const columns = { id:'编号', title:'标题', project:'项目', status:'状态', priority:'优先级', due:'截止日期', source:'来源', content:'知识内容', symptom:'现象与影响', root:'根因', prevention:'解决方案与预防', date:'记录日期' };
    sheet.columns = Object.entries(columns).map(([key,header]) => ({key,header,width:['content','symptom','root','prevention'].includes(key)?50:22}));
    for (const item of data[type] || []) sheet.addRow(item);
    sheet.getRow(1).font = { bold:true, color:{argb:'FFFFFFFF'} };
    sheet.getRow(1).fill = { type:'pattern',pattern:'solid',fgColor:{argb:'FF2563EB'} };
    sheet.views = [{ state:'frozen',ySplit:1 }];
    sheet.eachRow(row => { row.alignment = { vertical:'top',wrapText:true }; });
    return book.xlsx.writeFile(file);
  }
  throw new Error('导出格式不正确。');
}
module.exports = { parseFile, report, exportFile };
