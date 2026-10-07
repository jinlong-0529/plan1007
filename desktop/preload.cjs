const { contextBridge, ipcRenderer } = require('electron');
// 渲染页面仅能调用明确授权的方法，不能直接访问文件系统或 Node。
contextBridge.exposeInMainWorld('desktop', {
  request: (url, options) => ipcRenderer.invoke('records', url, options),
  importFiles: () => ipcRenderer.invoke('import-files'),
  exportFile: (type, format) => ipcRenderer.invoke('export-file', type, format),
  backup: () => ipcRenderer.invoke('backup'),
  restore: () => ipcRenderer.invoke('restore'),
  plane: settings => ipcRenderer.invoke('plane-import', settings)
});
