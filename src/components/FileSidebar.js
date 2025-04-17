import React, { useState } from 'react';
import './FileSidebar.css';

const FileSidebar = ({ 
  onFileSelect, 
  currentFilePath, 
  markdownContent, 
  documentTitle
}) => {
  // 确保状态正确初始化
  const [rootDirectory, setRootDirectory] = useState(null);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [directoryHandle, setDirectoryHandle] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  
  // 选择文件夹 - 修复状态更新函数
  const selectDirectory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // 检查 File System Access API 支持
      if (!('showDirectoryPicker' in window)) {
        throw new Error('您的浏览器不支持文件系统访问 API');
      }
      
      // 请求用户选择一个目录
      const dirHandle = await window.showDirectoryPicker();
      setDirectoryHandle(dirHandle);
      setRootDirectory(dirHandle.name);
      
      // 加载目录内容
      await loadDirectoryContents(dirHandle);
    } catch (err) {
      // 特殊处理用户取消操作
      if (err.name === 'AbortError') {
        // 用户取消了操作，不显示错误
        console.log('用户取消了文件夹选择');
      } else {
        // 其他错误正常显示
        console.error('选择目录失败:', err);
        setError(err.message || '选择目录失败');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // 加载目录内容
  const loadDirectoryContents = async (dirHandle, path = '') => {
    const fileEntries = [];
    
    try {
      for await (const entry of dirHandle.values()) {
        const entryPath = path ? `${path}/${entry.name}` : entry.name;
        
        if (entry.kind === 'file') {
          // 只添加.md文件
          if (entry.name.endsWith('.md')) {
            fileEntries.push({
              name: entry.name,
              path: entryPath,
              type: 'file',
              handle: entry
            });
          }
        } else if (entry.kind === 'directory') {
          // 递归加载子目录
          const subDirEntries = await loadDirectoryContents(entry, entryPath);
          fileEntries.push({
            name: entry.name,
            path: entryPath,
            type: 'directory',
            handle: entry,
            children: subDirEntries
          });
        }
      }
      
      if (path === '') {
        // 按类型和名称排序
        const sortedFiles = fileEntries.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        
        setFiles(sortedFiles);
      }
      
      return fileEntries;
    } catch (err) {
      console.error('加载目录内容失败:', err);
      setError(err.message || '加载目录内容失败');
      return [];
    }
  };
  
  // 打开文件
  const openFile = async (fileHandle) => {
    try {
      setIsLoading(true);
      const file = await fileHandle.getFile();
      const content = await file.text();
      
      // 调用父组件的回调函数，传递文件内容和名称
      onFileSelect({
        content,
        name: fileHandle.name,
        path: fileHandle.name,
        handle: fileHandle
      });
    } catch (err) {
      console.error('打开文件失败:', err);
      setError(err.message || '打开文件失败');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 保存当前文件
  const saveCurrentFile = async () => {
    if (!directoryHandle) {
      setError('请先选择一个文件夹');
      return;
    }
    
    try {
      // 如果是新文件或重命名
      const fileName = `${documentTitle}.md`;
      
      // 创建或获取文件句柄
      const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      
      // 写入文件内容
      const writable = await fileHandle.createWritable();
      await writable.write(markdownContent);
      await writable.close();
      
      // 刷新文件列表
      await loadDirectoryContents(directoryHandle);
      if (currentFilePath !== fileName) {
        await openFile(fileHandle);
      }
      return { success: true, fileName, handle: fileHandle };
    } catch (err) {
      console.error('保存文件失败:', err);
      setError(err.message || '保存文件失败');
      return { success: false, error: err.message };
    }
  };
  
  // 创建新文件
  const createNewFile = async () => {
    if (!directoryHandle) {
      setError('请先选择一个文件夹');
      return;
    }
    
    try {
      const fileName = prompt('请输入新文件名:', 'untitled.md');
      if (!fileName) return;
      
      const finalName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
      
      // 创建文件
      const fileHandle = await directoryHandle.getFileHandle(finalName, { create: true });
      
      // 写入空内容
      const writable = await fileHandle.createWritable();
      await writable.write('# 新文档');
      await writable.close();
      
      // 刷新文件列表
      await loadDirectoryContents(directoryHandle);
      
      // 打开新创建的文件
      if (currentFilePath !== fileName) {
        await openFile(fileHandle);
      }
    } catch (err) {
      console.error('创建文件失败:', err);
      setError(err.message || '创建文件失败');
    }
  };
  
  // 切换文件夹展开/折叠状态
  const toggleFolder = (path) => {
    setExpandedFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };
  
  // 列表形式渲染文件树
  const renderFileTree = () => {
    // 使用展平的方式递归收集所有文件项
    const collectFileItems = (items, parentPath = '') => {
      let allItems = [];
      
      items.forEach(item => {
        const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;
        
        if (item.type === 'directory') {
          // 添加文件夹
          allItems.push({
            ...item,
            level: parentPath.split('/').filter(Boolean).length,
            isExpanded: expandedFolders[itemPath] || false
          });
          
          // 如果文件夹已展开，添加其子项
          if (expandedFolders[itemPath]) {
            allItems = [...allItems, ...collectFileItems(item.children, itemPath)];
          }
        } else {
          // 添加文件
          allItems.push({
            ...item,
            level: parentPath.split('/').filter(Boolean).length
          });
        }
      });
      
      return allItems;
    };
    
    const allFileItems = collectFileItems(files);
    
    return (
      <div className="file-list">
        {allFileItems.map(item => (
          <div 
            key={item.path}
            className={`file-list-item ${item.type === 'file' && currentFilePath === item.path ? 'active' : ''}`}
            style={{ paddingLeft: `${(item.level + 1) * 16}px` }}
          >
            {item.type === 'directory' ? (
              <div 
                className="directory-item"
                onClick={() => toggleFolder(item.path)}
              >
                <span className="folder-icon">
                  {item.isExpanded ? '📂' : '📁'}
                </span>
                <span className="folder-name">{item.name}</span>
              </div>
            ) : (
              <div 
                className="file-item"
                onClick={() => openFile(item.handle)}
              >
                <span className="file-icon">📄</span>
                <span className="file-name">{item.name}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="file-sidebar">
      <div className="sidebar-header">
        <h3>文件浏览器</h3>
        <div className="sidebar-actions">
          <button 
            className="sidebar-button"
            onClick={selectDirectory}
            disabled={isLoading}
          >
            {rootDirectory ? '更改文件夹' : '选择文件夹'}
          </button>
          
          {rootDirectory && (
            <>
              <button 
                className="sidebar-button"
                onClick={createNewFile}
                disabled={isLoading}
              >
                新建文件
              </button>
              
              <button 
                className="sidebar-button"
                onClick={saveCurrentFile}
                disabled={isLoading}
              >
                另存为
              </button>
            </>
          )}
        </div>
      </div>
      
      {rootDirectory && (
        <div className="current-directory">
          <strong>当前文件夹:</strong> {rootDirectory}
        </div>
      )}
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {isLoading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="file-tree">
          {files.length > 0 ? (
            renderFileTree()
          ) : (
            rootDirectory && <div className="empty-folder">文件夹为空或没有Markdown文件</div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileSidebar;
