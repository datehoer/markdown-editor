import React, { useState, useEffect, useRef, useCallback } from 'react';
import './FileSidebar.css';
// 引入webdav客户端库
import { createClient } from 'webdav';

// 添加面包屑导航组件
const PathBreadcrumbs = ({ path, storageType, onNavigate }) => {
  // 解析路径
  const parts = path ? path.split('/').filter(Boolean) : [];
  const isRoot = parts.length === 0;
  
  return (
    <div className="path-breadcrumbs">
      <span 
        className={`breadcrumb-item ${isRoot ? 'active' : ''}`}
        onClick={() => onNavigate('/')}
        title="根目录"
      >
        {storageType === 'webdav' ? 'WebDAV:' : '根目录'}
      </span>
      
      {parts.map((part, index) => {
        // 构建到这个部分的路径
        const partPath = '/' + parts.slice(0, index + 1).join('/');
        const isLast = index === parts.length - 1;
        
        return (
          <React.Fragment key={index}>
            <span className="breadcrumb-separator">/</span>
            <span 
              className={`breadcrumb-item ${isLast ? 'active' : ''}`}
              onClick={() => onNavigate(partPath)}
              title={part}
            >
              {part}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// 文件操作菜单组件
const FileItemMenu = ({ item, position, onRename, onDelete }) => {
  return (
    <div 
      className="file-context-menu"
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x
      }}
    >
      <div 
        className="context-menu-item"
        onClick={() => onRename(item)}
      >
        <span>✏️ 重命名</span>
      </div>
      <div 
        className="context-menu-item"
        onClick={() => onDelete(item)}
      >
        <span>🗑️ 删除</span>
      </div>
    </div>
  );
};

const FileSidebar = ({ 
  onFileSelect, 
  currentFilePath, 
  markdownContent, 
  documentTitle
}) => {
  const [rootDirectory, setRootDirectory] = useState(null);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [directoryHandle, setDirectoryHandle] = useState(null);
  
  // 侧边栏宽度相关状态
  const sidebarRef = useRef(null);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isDragging, setIsDragging] = useState(false);
  
  const [storageType, setStorageType] = useState('local'); // local 或 webdav
  const [showWebdavForm, setShowWebdavForm] = useState(false);
  const [webdavConfig, setWebdavConfig] = useState({
    url: '',
    username: '',
    password: '',
    path: '/webdav',
    autoCreateDirectory: false,
    savePassword: false
  });
  const [webdavClient, setWebdavClient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // 历史连接相关状态
  const [webdavHistory, setWebdavHistory] = useState([]);
  const [showWebdavHistory, setShowWebdavHistory] = useState(false);
  
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [folderMenuPosition, setFolderMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedItem, setSelectedItem] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');

  // 添加本地目录句柄缓存，用于导航
  const [directoryHandleCache, setDirectoryHandleCache] = useState({});

  // 处理侧边栏拖动调整宽度
  const isDraggingRef = useRef(false);
  
  const handleMouseMove = useCallback((e) => {
    if (isDraggingRef.current && sidebarRef.current) {
      // 计算新宽度 - 使用pageX而不是clientX，以获得更准确的位置
      const newWidth = e.pageX;
      // 根据是否连接WebDAV设定最小宽度
      const minWidth = isConnected && storageType === 'webdav' ? 220 : 180;
      
      if (newWidth >= minWidth) {
        setSidebarWidth(newWidth);
        sidebarRef.current.style.width = `${newWidth}px`;
        
        // 设置宽度状态以控制按钮文本显示
        sidebarRef.current.dataset.compact = newWidth < 240 ? 'true' : 'false';
      }
    }
  }, [isConnected, storageType]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    
    // 触发一个resize事件，通知其他组件侧边栏大小已更改
    window.dispatchEvent(new Event('resize'));
  }, [setIsDragging]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  // 设置和清理事件监听器
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // 加载WebDAV历史连接记录和侧边栏宽度
  useEffect(() => {
    const loadWebdavHistory = () => {
      try {
        const savedHistory = localStorage.getItem('webdav_history');
        if (savedHistory) {
          const parsedHistory = JSON.parse(savedHistory);
          setWebdavHistory(parsedHistory);
        }
      } catch (err) {
        console.error('加载WebDAV历史记录失败:', err);
      }
    };
    
    const loadSidebarWidth = () => {
      try {
        const savedWidth = localStorage.getItem('sidebar_width');
        if (savedWidth) {
          const width = parseInt(savedWidth, 10);
          if (!isNaN(width) && width >= 180) {
            setSidebarWidth(width);
          }
        }
      } catch (err) {
        console.error('加载侧边栏宽度失败:', err);
      }
    };
    
    loadWebdavHistory();
    loadSidebarWidth();
  }, []);
  
  // 保存侧边栏宽度
  useEffect(() => {
    if (sidebarWidth >= 180) {
      localStorage.setItem('sidebar_width', sidebarWidth.toString());
      
      // 更新紧凑模式状态
      if (sidebarRef.current) {
        sidebarRef.current.dataset.compact = sidebarWidth < 240 ? 'true' : 'false';
      }
    }
  }, [sidebarWidth]);
  
  // 保存WebDAV历史连接记录
  const saveWebdavHistory = (config) => {
    try {
      // 创建配置对象，根据设置决定是否保存密码
      const configToSave = {
        url: config.url,
        username: config.username,
        path: config.path,
        autoCreateDirectory: config.autoCreateDirectory,
        savePassword: config.savePassword,
        label: `${config.username}@${config.url}${config.path}`,
        timestamp: new Date().getTime()
      };
      
      // 如果选择保存密码，则添加密码字段
      if (config.savePassword) {
        configToSave.password = config.password;
      }
      
      // 使用配置URL作为唯一标识
      const existingIndex = webdavHistory.findIndex(
        item => item.url === config.url && item.username === config.username
      );
      
      let newHistory = [...webdavHistory];
      
      if (existingIndex >= 0) {
        // 更新现有连接
        newHistory[existingIndex] = configToSave;
      } else {
        // 添加新连接
        newHistory.unshift(configToSave);
        
        // 如果超过5个连接，删除最老的
        if (newHistory.length > 5) {
          newHistory = newHistory.slice(0, 5);
        }
      }
      
      // 保存到localStorage
      localStorage.setItem('webdav_history', JSON.stringify(newHistory));
      setWebdavHistory(newHistory);
    } catch (err) {
      console.error('保存WebDAV历史记录失败:', err);
    }
  };
  
  // 从历史记录中删除WebDAV连接
  const removeWebdavHistory = (index) => {
    try {
      const newHistory = [...webdavHistory];
      newHistory.splice(index, 1);
      
      localStorage.setItem('webdav_history', JSON.stringify(newHistory));
      setWebdavHistory(newHistory);
    } catch (err) {
      console.error('删除WebDAV历史记录失败:', err);
    }
  };
  
  // 从历史记录中选择连接
  const selectHistoryConnection = (config) => {
    setWebdavConfig({
      ...webdavConfig,
      url: config.url,
      username: config.username,
      path: config.path,
      autoCreateDirectory: config.autoCreateDirectory || false,
      savePassword: config.savePassword || false,
      // 如果历史记录中保存了密码，则使用它
      password: config.password || ''
    });
    
    setShowWebdavHistory(false);
    setShowWebdavForm(true);
  };
  
  // 打开历史连接列表
  const toggleWebdavHistory = () => {
    setShowWebdavHistory(!showWebdavHistory);
    if (showWebdavForm) {
      setShowWebdavForm(false);
    }
  };

  // 关闭文件夹菜单
  const closeFolderMenu = () => {
    setShowFolderMenu(false);
  };

  // 在点击其他地方时关闭菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFolderMenu(false);
    };
    
    if (showFolderMenu) {
      document.addEventListener('click', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showFolderMenu]);

  // 重命名项目
  const renameItem = async (item) => {
    const newName = prompt('请输入新名称:', item.name);
    if (!newName || newName === item.name) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      if (item.handle?.isWebdav) {
        const oldPath = item.path;
        const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
        const newPath = `${parentPath}/${newName}`;
        
        await webdavClient.moveFile(oldPath, newPath);
        
        // 刷新当前目录
        await loadWebdavContents(webdavClient, currentPath);
      } else {
        setError('本地文件系统暂不支持重命名');
      }
    } catch (err) {
      console.error('重命名失败:', err);
      setError('重命名失败: ' + (err.message || '未知错误'));
    } finally {
      setIsLoading(false);
      closeFolderMenu();
    }
  };

  // 删除项目
  const deleteItem = async (item) => {
    const confirmDelete = window.confirm(`确定要删除 ${item.name} 吗?`);
    if (!confirmDelete) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      if (item.handle?.isWebdav) {
        if (item.type === 'directory') {
          await webdavClient.deleteFile(item.path);
        } else {
          await webdavClient.deleteFile(item.path);
        }
        
        // 刷新当前目录
        await loadWebdavContents(webdavClient, currentPath);
      } else {
        setError('本地文件系统暂不支持删除');
      }
    } catch (err) {
      console.error('删除失败:', err);
      setError('删除失败: ' + (err.message || '未知错误'));
    } finally {
      setIsLoading(false);
      closeFolderMenu();
    }
  };

  const selectDirectory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // 记录之前的存储类型和状态，以便在用户取消选择时还原
      const previousStorageType = storageType;
      
      if (!('showDirectoryPicker' in window)) {
        throw new Error('您的浏览器不支持文件系统访问 API');
      }
      
      // 临时设置状态为本地，以便在UI上显示正确的状态
      setStorageType('local');
      
      let dirHandle;
      try {
        dirHandle = await window.showDirectoryPicker();
      } catch (pickErr) {
        // 用户取消了选择，恢复之前的存储类型
        if (pickErr.name === 'AbortError') {
          console.log('用户取消了文件夹选择');
          
          // 恢复到之前的存储类型
          setStorageType(previousStorageType);
          
          // 如果之前是WebDAV，确保UI状态正确
          if (previousStorageType === 'webdav' && webdavClient) {
            setRootDirectory(`WebDAV: ${webdavConfig.url}`);
          }
          
          // 取消加载状态并直接返回
          setIsLoading(false);
          return;
        } else {
          throw pickErr; // 非取消错误，继续抛出
        }
      }
      
      // 用户成功选择了目录，继续设置本地文件系统
      setDirectoryHandle(dirHandle);
      setRootDirectory(dirHandle.name);
      
      // 初始化目录句柄缓存
      const cache = { '/': dirHandle };
      setDirectoryHandleCache(cache);
      
      // 设置当前路径为根路径
      setCurrentPath('/');
      
      // 加载根目录内容
      await loadDirectoryContents(dirHandle, '', cache);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('用户取消了文件夹选择');
      } else {
        console.error('选择目录失败:', err);
        setError(err.message || '选择目录失败');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const connectWebdav = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (!webdavConfig.url || !webdavConfig.username) {
        throw new Error('URL和用户名为必填项');
      }
      
      const client = createClient(webdavConfig.url, {
        username: webdavConfig.username,
        password: webdavConfig.password
      });
      
      try {
        // 检查路径是否存在
        const pathExists = await client.exists(webdavConfig.path);
        
        // 如果路径不存在，并且启用了自动创建目录选项
        if (!pathExists && webdavConfig.autoCreateDirectory) {
          try {
            // 按层级递归创建目录
            const pathParts = webdavConfig.path.split('/').filter(Boolean);
            let currentPath = '';
            
            for (const part of pathParts) {
              currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
              
              // 检查当前层级的路径是否存在
              const exists = await client.exists(currentPath);
              if (!exists) {
                // 如果不存在，创建该目录
                await client.createDirectory(currentPath);
                console.log(`已创建目录: ${currentPath}`);
              }
            }
          } catch (createDirErr) {
            throw new Error(`自动创建目录失败: ${createDirErr.message}`);
          }
        } else if (!pathExists) {
          // 如果路径不存在，且未启用自动创建，则抛出错误
          throw new Error(`路径不存在: ${webdavConfig.path}`);
        }
        
        setWebdavClient(client);
        setIsConnected(true);
        setStorageType('webdav');
        setRootDirectory(`WebDAV: ${webdavConfig.url}`);
        setCurrentPath(webdavConfig.path);
        
        // 自动调整侧边栏宽度以显示断开按钮
        if (sidebarRef.current && sidebarWidth < 240) {
          const newWidth = Math.max(sidebarWidth, 260);
          setSidebarWidth(newWidth);
          sidebarRef.current.style.width = `${newWidth}px`;
          sidebarRef.current.dataset.compact = "false";
        }
        
        // 保存成功的连接到历史记录
        saveWebdavHistory(webdavConfig);
        
        await loadWebdavContents(client, webdavConfig.path);
        setShowWebdavForm(false);
      } catch (connErr) {
        console.error('WebDAV连接错误详情:', connErr);
        throw new Error(`连接失败: ${connErr.message || '无法连接到WebDAV服务器'}`);
      }
    } catch (err) {
      console.error('WebDAV连接失败:', err);
      setError(err.message || 'WebDAV连接失败');
    } finally {
      setIsLoading(false);
    }
  };

  const loadWebdavContents = async (client, path = '/webdav') => {
    console.log('加载WebDAV目录:', path);
    try {
      const exists = await client.exists(path);
      
      // 如果路径不存在，并且启用了自动创建目录选项
      if (!exists && webdavConfig.autoCreateDirectory) {
        try {
          // 按层级递归创建目录
          const pathParts = path.split('/').filter(Boolean);
          let currentPath = '';
          
          for (const part of pathParts) {
            currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
            
            // 检查当前层级的路径是否存在
            const exists = await client.exists(currentPath);
            if (!exists) {
              // 如果不存在，创建该目录
              await client.createDirectory(currentPath);
              console.log(`已创建目录: ${currentPath}`);
            }
          }
        } catch (createDirErr) {
          throw new Error(`自动创建目录失败: ${createDirErr.message}`);
        }
      } else if (!exists) {
        throw new Error(`路径不存在: ${path}`);
      }
      
      const contents = await client.getDirectoryContents(path);
      console.log('WebDAV目录内容:', contents);
      
      const mappedFiles = contents
        .map(item => {
          const name = item.basename || item.filename.split('/').pop();
          const itemPath = item.filename;
          
          if (item.type === 'directory') {
            return {
              name,
              path: itemPath,
              type: 'directory',
              handle: {
                path: itemPath,
                isWebdav: true
              },
              children: []
            };
          } else if (item.type === 'file' && item.filename.endsWith('.md')) {
            return {
              name,
              path: itemPath,
              type: 'file',
              handle: {
                path: itemPath,
                isWebdav: true
              }
            };
          }
          return null;
        })
        .filter(Boolean);
      
      const sortedFiles = mappedFiles.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      setFiles(sortedFiles);
      setCurrentPath(path);
      
      console.log('处理后的文件列表:', sortedFiles);
      return sortedFiles;
    } catch (err) {
      console.error('加载WebDAV目录内容失败:', err);
      setError(err.message || '加载WebDAV目录内容失败');
      return [];
    }
  };

  const loadDirectoryContents = async (dirHandle, path = '', handleCache = null) => {
    const fileEntries = [];
    const cache = handleCache || directoryHandleCache;
    
    try {
      for await (const entry of dirHandle.values()) {
        const entryPath = path ? `${path}/${entry.name}` : entry.name;
        const fullPath = `/${entryPath}`;
        
        if (entry.kind === 'file') {
          if (entry.name.endsWith('.md')) {
            fileEntries.push({
              name: entry.name,
              path: fullPath,
              type: 'file',
              handle: entry
            });
          }
        } else if (entry.kind === 'directory') {
          if (cache) {
            cache[fullPath] = entry;
          }
          
          fileEntries.push({
            name: entry.name,
            path: fullPath,
            type: 'directory',
            handle: entry,
            children: []
          });
        }
      }
      
      if (path === '') {
        const sortedFiles = fileEntries.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        
        setFiles(sortedFiles);
        
        if (handleCache) {
          setDirectoryHandleCache(handleCache);
        }
      }
      
      return fileEntries;
    } catch (err) {
      console.error('加载目录内容失败:', err);
      setError(err.message || '加载目录内容失败');
      return [];
    }
  };

  const navigateTo = async (path) => {
    console.log('导航到路径:', path);
    setIsLoading(true);
    setError(null);
    
    try {
      if (storageType === 'webdav') {
        await loadWebdavContents(webdavClient, path);
        setCurrentPath(path);
      } else if (storageType === 'local') {
        if (path === '/') {
          await loadDirectoryContents(directoryHandle);
          setCurrentPath('/');
        } else {
          const dirHandle = directoryHandleCache[path];
          
          if (dirHandle) {
            const entries = await loadDirectoryContents(dirHandle);
            setFiles(entries);
            setCurrentPath(path);
          } else {
            const pathParts = path.split('/').filter(Boolean);
            let currentHandle = directoryHandle;
            let currentPath = '';
            
            for (const part of pathParts) {
              try {
                currentHandle = await currentHandle.getDirectoryHandle(part);
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                
                const fullPath = `/${currentPath}`;
                directoryHandleCache[fullPath] = currentHandle;
                setDirectoryHandleCache({...directoryHandleCache});
              } catch (err) {
                throw new Error(`无法访问路径 ${part}: ${err.message}`);
              }
            }
            
            const entries = await loadDirectoryContents(currentHandle);
            setFiles(entries);
            setCurrentPath(path);
          }
        }
      }
    } catch (err) {
      console.error('导航失败:', err);
      setError('导航失败: ' + (err.message || '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  const refreshFileList = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (storageType === 'local' && directoryHandle) {
        await loadDirectoryContents(directoryHandle);
      } else if (storageType === 'webdav' && webdavClient) {
        await loadWebdavContents(webdavClient, webdavConfig.path || '/');
      } else {
        setError('没有可刷新的文件列表');
      }
    } catch (err) {
      console.error('刷新文件列表失败:', err);
      setError('刷新文件列表失败: ' + (err.message || '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  const navigateUp = () => {
    if (currentPath === '/' || currentPath === '/webdav') return;
    
    const pathParts = currentPath.split('/').filter(Boolean);
    pathParts.pop(); // 移除最后一个部分
    const parentPath = pathParts.length ? '/' + pathParts.join('/') : '/';
    
    navigateTo(parentPath);
  };

  const openFile = async (fileHandle) => {
    try {
      setIsLoading(true);
      
      if (fileHandle.isWebdav) {
        const content = await webdavClient.getFileContents(fileHandle.path, { format: 'text' });
        const name = fileHandle.path.split('/').pop();
        
        onFileSelect({
          content,
          name,
          path: fileHandle.path,
          handle: fileHandle,
          isWebdav: true
        });
      } else {
        const file = await fileHandle.getFile();
        const content = await file.text();
        
        onFileSelect({
          content,
          name: fileHandle.name,
          path: fileHandle.name,
          handle: fileHandle,
          isWebdav: false
        });
      }
    } catch (err) {
      console.error('打开文件失败:', err);
      setError(err.message || '打开文件失败');
    } finally {
      setIsLoading(false);
    }
  };

  const renderWebdavForm = () => {
    return (
      <div className="webdav-form">
        <h4>连接WebDAV服务器</h4>
        
        <div className="form-group">
          <label>服务器地址:</label>
          <input 
            type="url" 
            name="url" 
            value={webdavConfig.url} 
            onChange={handleWebdavConfigChange}
            placeholder="https://example.com/dav"
          />
        </div>
        
        <div className="form-group">
          <label>用户名:</label>
          <input 
            type="text" 
            name="username" 
            value={webdavConfig.username} 
            onChange={handleWebdavConfigChange}
          />
        </div>
        
        <div className="form-group">
          <label>密码:</label>
          <input 
            type="password" 
            name="password" 
            value={webdavConfig.password} 
            onChange={handleWebdavConfigChange}
          />
        </div>
        
        <div className="form-group">
          <label>初始路径:</label>
          <input 
            type="text" 
            name="path" 
            value={webdavConfig.path} 
            onChange={handleWebdavConfigChange}
            placeholder="/webdav"
          />
        </div>
        
        <div className="form-group">
          <label className="checkbox-label">
            <input 
              type="checkbox" 
              name="autoCreateDirectory" 
              checked={webdavConfig.autoCreateDirectory} 
              onChange={handleWebdavConfigChange}
            />
            自动创建不存在的文件夹
          </label>
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input 
              type="checkbox" 
              name="savePassword" 
              checked={webdavConfig.savePassword} 
              onChange={handleWebdavConfigChange}
            />
            保存密码（安全提醒：密码将以明文存储在浏览器中）
          </label>
        </div>
        
        <div className="form-actions form-actions-triple">
          <button 
            className="sidebar-button secondary-button"
            onClick={toggleWebdavHistory}
            title="返回历史连接"
          >
            历史
          </button>
          <button 
            className="sidebar-button secondary-button"
            onClick={() => setShowWebdavForm(false)}
          >
            取消
          </button>
          <button 
            className="sidebar-button primary-button"
            onClick={connectWebdav}
            disabled={isLoading}
          >
            连接
          </button>
        </div>
      </div>
    );
  };

  const handleWebdavConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
    setWebdavConfig({
      ...webdavConfig,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const createNewFile = async (folderPath, folderHandle) => {
    const targetPath = folderPath || currentPath;
    let targetHandle = folderHandle;
    
    if (!targetHandle && storageType === 'local') {
      targetHandle = directoryHandleCache[targetPath] || directoryHandle;
    }
    
    if (storageType === 'local') {
      if (!targetHandle) {
        setError('请先选择一个文件夹');
        return;
      }
      
      try {
        const fileName = prompt('请输入新文件名:', 'untitled.md');
        if (!fileName) return;
        
        const finalName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
        
        const fileHandle = await targetHandle.getFileHandle(finalName, { create: true });
        
        const writable = await fileHandle.createWritable();
        await writable.write('# 新文档');
        await writable.close();
        
        await navigateTo(targetPath);
        
        await openFile(fileHandle);
      } catch (err) {
        console.error('创建文件失败:', err);
        setError(err.message || '创建文件失败');
      }
    } else if (storageType === 'webdav') {
      if (!webdavClient) {
        setError('WebDAV未连接');
        return;
      }
      
      try {
        const fileName = prompt('请输入新文件名:', 'untitled.md');
        if (!fileName) return;
        
        const finalName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
        
        let filePath;
        if (targetPath === '/') {
          filePath = `/${finalName}`;
        } else {
          filePath = `${targetPath}/${finalName}`;
        }
        
        // 检查父目录是否存在
        const parentPath = targetPath;
        const parentExists = await webdavClient.exists(parentPath);
        
        // 如果父目录不存在，且开启了自动创建目录
        if (!parentExists && webdavConfig.autoCreateDirectory) {
          try {
            // 按层级递归创建父目录
            const pathParts = parentPath.split('/').filter(Boolean);
            let currentPath = '';
            
            for (const part of pathParts) {
              currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
              
              // 检查当前层级的路径是否存在
              const exists = await webdavClient.exists(currentPath);
              if (!exists) {
                // 如果不存在，创建该目录
                await webdavClient.createDirectory(currentPath);
                console.log(`已创建目录: ${currentPath}`);
              }
            }
          } catch (createDirErr) {
            throw new Error(`自动创建目录失败: ${createDirErr.message}`);
          }
        } else if (!parentExists) {
          throw new Error(`父目录不存在: ${parentPath}`);
        }
        
        await webdavClient.putFileContents(filePath, '# 新文档');
        
        await navigateTo(targetPath);
        
        const fileHandle = { path: filePath, isWebdav: true };
        await openFile(fileHandle);
      } catch (err) {
        console.error('创建WebDAV文件失败:', err);
        setError(err.message || '创建WebDAV文件失败');
      }
    }
    
    closeFolderMenu();
  };

  const createNewFolder = async (parentPath, parentHandle) => {
    const targetPath = parentPath || currentPath;
    let targetHandle = parentHandle;
    
    if (!targetHandle && storageType === 'local') {
      targetHandle = directoryHandleCache[targetPath] || directoryHandle;
    }
    
    const folderName = prompt('请输入新文件夹名称:', '新文件夹');
    if (!folderName) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      if (storageType === 'local' && targetHandle) {
        await targetHandle.getDirectoryHandle(folderName, { create: true });
        await navigateTo(targetPath);
      } else if (storageType === 'webdav' && webdavClient) {
        let newDirPath;
        if (targetPath === '/') {
          newDirPath = `/${folderName}`;
        } else {
          newDirPath = `${targetPath}/${folderName}`;
        }
        
        // 检查父目录是否存在
        const parentExists = await webdavClient.exists(targetPath);
        
        
        // 如果父目录不存在，且开启了自动创建目录
        if (!parentExists && webdavConfig.autoCreateDirectory) {
          try {
            // 按层级递归创建父目录
            const pathParts = targetPath.split('/').filter(Boolean);
            let currentPath = '';
            
            for (const part of pathParts) {
              currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
              
              // 检查当前层级的路径是否存在
              const exists = await webdavClient.exists(currentPath);
              if (!exists) {
                // 如果不存在，创建该目录
                await webdavClient.createDirectory(currentPath);
                console.log(`已创建目录: ${currentPath}`);
              }
            }
          } catch (createDirErr) {
            throw new Error(`自动创建目录失败: ${createDirErr.message}`);
          }
        } else if (!parentExists) {
          throw new Error(`父目录不存在: ${targetPath}`);
        }
        
        await webdavClient.createDirectory(newDirPath);
        await navigateTo(targetPath);
      } else {
        setError('无法创建文件夹 - 未连接存储');
      }
    } catch (err) {
      console.error('创建文件夹失败:', err);
      setError('创建文件夹失败: ' + (err.message || '未知错误'));
    } finally {
      setIsLoading(false);
      closeFolderMenu();
    }
  };

  const saveCurrentFile = async () => {
    if (storageType === 'local') {
      if (!directoryHandle) {
        setError('请先选择一个文件夹');
        return { success: false, error: '请先选择一个文件夹' };
      }
      
      try {
        const fileName = `${documentTitle}.md`;
        const targetHandle = directoryHandleCache[currentPath] || directoryHandle;
        
        const fileHandle = await targetHandle.getFileHandle(fileName, { create: true });
        
        const writable = await fileHandle.createWritable();
        await writable.write(markdownContent);
        await writable.close();
        
        await navigateTo(currentPath);
        
        onFileSelect({
          content: markdownContent,
          name: fileName,
          path: `${currentPath}/${fileName}`.replace(/\/+/g, '/'),
          handle: fileHandle,
          isWebdav: false
        });
        
        return { success: true, fileName, handle: fileHandle, isWebdav: false };
      } catch (err) {
        console.error('保存文件失败:', err);
        setError(err.message || '保存文件失败');
        return { success: false, error: err.message };
      }
    } else if (storageType === 'webdav') {
      if (!webdavClient) {
        setError('WebDAV未连接');
        return { success: false, error: 'WebDAV未连接' };
      }
      
      try {
        const fileName = `${documentTitle}.md`;
        const filePath = `${currentPath}/${fileName}`.replace(/\/+/g, '/');
        
        // 检查父目录是否存在
        const parentPath = currentPath;
        const parentExists = await webdavClient.exists(parentPath);
        
        // 如果父目录不存在，且开启了自动创建目录
        if (!parentExists && webdavConfig.autoCreateDirectory) {
          try {
            // 按层级递归创建父目录
            const pathParts = parentPath.split('/').filter(Boolean);
            let currentPath = '';
            
            for (const part of pathParts) {
              currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
              
              // 检查当前层级的路径是否存在
              const exists = await webdavClient.exists(currentPath);
              if (!exists) {
                // 如果不存在，创建该目录
                await webdavClient.createDirectory(currentPath);
                console.log(`已创建目录: ${currentPath}`);
              }
            }
          } catch (createDirErr) {
            throw new Error(`自动创建目录失败: ${createDirErr.message}`);
          }
        } else if (!parentExists) {
          throw new Error(`父目录不存在: ${parentPath}`);
        }
        
        await webdavClient.putFileContents(filePath, markdownContent, { overwrite: true });
        
        await navigateTo(currentPath);
        
        onFileSelect({
          content: markdownContent,
          name: fileName,
          path: filePath,
          handle: { path: filePath, isWebdav: true },
          isWebdav: true
        });
        
        return {
          success: true,
          fileName,
          path: filePath,
          handle: { path: filePath, isWebdav: true }
        };
      } catch (err) {
        console.error('保存WebDAV文件失败:', err);
        setError(err.message || '保存WebDAV文件失败');
        return { success: false, error: err.message };
      }
    }
  };

  const renderFileList = () => {
    // 检查当前状态是否有效：本地模式需要directoryHandle，WebDAV模式需要webdavClient
    const isValidState = 
      (storageType === 'local' && directoryHandle) || 
      (storageType === 'webdav' && webdavClient);
    
    if (!isValidState) {
      return (
        <div className="connect-prompt">
          {storageType === 'local' 
            ? '请选择本地文件夹' 
            : '请连接WebDAV服务器'}
        </div>
      );
    }
    
    return (
      <div className="file-browser-container">
        <div className="path-navigation">
          <button 
            className="nav-button" 
            onClick={navigateUp}
            disabled={currentPath === '/' || currentPath === '/webdav'}
            title="返回上一级"
          >
            ⬆️
          </button>
          
          <button 
            className="nav-button" 
            onClick={refreshFileList}
            title="刷新"
          >
            🔄
          </button>
          
          <PathBreadcrumbs 
            path={currentPath} 
            storageType={storageType} 
            onNavigate={navigateTo} 
          />
        </div>
        
        <div className="file-items-container">
          {files.length > 0 ? (
            renderFileTree()
          ) : (
            <div className="empty-folder">
              <p>文件夹为空或没有Markdown文件</p>
              <p className="debug-info">当前路径: {currentPath}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFileTree = () => {
    return (
      <div className="file-list">
        {files.map(item => (
          <div 
            key={item.path}
            className={`file-list-item ${item.type === 'file' && currentFilePath === item.path ? 'active' : ''}`}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              
              setFolderMenuPosition({
                x: e.clientX,
                y: e.clientY
              });
              
              setSelectedItem(item);
              setShowFolderMenu(true);
            }}
          >
            {item.type === 'directory' ? (
              <div 
                className="directory-item"
                onClick={() => navigateTo(item.path)}
              >
                <div className="folder-icon">📁</div>
                <div className="folder-name">{item.name}</div>
              </div>
            ) : (
              <div 
                className="file-item"
                onClick={() => openFile(item.handle)}
              >
                <div className="file-icon">📄</div>
                <div className="file-name">{item.name}</div>
              </div>
            )}
          </div>
        ))}
        
        {showFolderMenu && selectedItem && (
          <FileItemMenu 
            item={selectedItem}
            position={folderMenuPosition}
            onRename={renameItem}
            onDelete={deleteItem}
          />
        )}
      </div>
    );
  };

  const renderWebdavHistory = () => {
    return (
      <div className="webdav-history">
        <h4>历史连接</h4>
        
        {webdavHistory.length === 0 ? (
          <div className="empty-history">
            暂无历史连接记录
          </div>
        ) : (
          <div className="history-list">
            {webdavHistory.map((item, index) => (
              <div key={index} className="history-item">
                <div 
                  className="history-item-content"
                  onClick={() => selectHistoryConnection(item)}
                >
                  <div className="history-item-label">{item.label}</div>
                  <div className="history-item-url">{item.url}</div>
                </div>
                <button
                  className="history-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWebdavHistory(index);
                  }}
                  title="删除此连接"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="form-actions">
          <button 
            className="sidebar-button secondary-button"
            onClick={toggleWebdavHistory}
          >
            返回
          </button>
          <button 
            className="sidebar-button primary-button"
            onClick={() => {
              setShowWebdavHistory(false);
              setShowWebdavForm(true);
            }}
          >
            新建连接
          </button>
        </div>
      </div>
    );
  };

  // 断开WebDAV连接
  const disconnectWebdav = () => {
    if (storageType === 'webdav' && webdavClient) {
      // 重置WebDAV相关状态
      setWebdavClient(null);
      setIsConnected(false);
      setFiles([]);
      setCurrentPath('/');
      
      // 切换到默认状态
      setStorageType('local');
      setError(null);
    }
  };

  // 处理侧边栏宽度变化时按钮文本的显示/隐藏
  useEffect(() => {
    const updateButtonText = () => {
      if (sidebarRef.current) {
        const width = sidebarRef.current.offsetWidth;
        // 设置一个自定义数据属性表示宽度状态
        sidebarRef.current.dataset.compact = width < 240 ? 'true' : 'false';
      }
    };
    
    // 初始设置
    updateButtonText();
    
    // 当宽度变化时更新
    const observer = new ResizeObserver(() => {
      updateButtonText();
    });
    
    if (sidebarRef.current) {
      observer.observe(sidebarRef.current);
    }
    
    // 监听窗口resize事件，确保在窗口调整大小时也能正确触发
    window.addEventListener('resize', updateButtonText);
    
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateButtonText);
    };
  }, []);

  return (
    <div 
      className="file-sidebar"
      ref={sidebarRef}
      style={{ width: `${sidebarWidth}px` }}
    >
      <div className="sidebar-header">
        <h3>文件浏览器</h3>
        <div className="storage-buttons">
          <button 
            className={`storage-option ${storageType === 'local' ? 'active' : ''}`}
            onClick={selectDirectory}
            disabled={isLoading}
            title={directoryHandle ? `当前本地目录: ${rootDirectory}` : '选择本地目录'}
          >
            💻 <span>本地</span>
          </button>
          <button 
            className={`storage-option ${storageType === 'webdav' ? 'active' : ''} ${isConnected ? 'disconnect' : ''}`}
            onClick={isConnected ? disconnectWebdav : toggleWebdavHistory}
            disabled={isLoading}
            title={webdavClient ? `点击断开当前WebDAV连接: ${webdavConfig.username}@${webdavConfig.url}${webdavConfig.path}` : 'WebDAV连接'}
          >
            {isConnected ? '🔌' : '🌐'} <span>{isConnected ? '断开' : 'WebDAV'}</span>
          </button>
        </div>
      </div>
      
      {showWebdavForm ? (
        renderWebdavForm()
      ) : showWebdavHistory ? (
        renderWebdavHistory()
      ) : (
        <div className="sidebar-content">
          <div className="action-toolbar">
            <button 
              className="action-button"
              onClick={() => createNewFile()}
              disabled={isLoading || (!directoryHandle && storageType === 'local') || (storageType === 'webdav' && !isConnected)}
              title="创建新文件"
            >
              📄 <span>新文件</span>
            </button>
            <button 
              className="action-button"
              onClick={() => createNewFolder()}
              disabled={isLoading || (!directoryHandle && storageType === 'local') || (storageType === 'webdav' && !isConnected)}
              title="创建新文件夹"
            >
              📁 <span>新文件夹</span>
            </button>
            <button 
              className="action-button"
              onClick={saveCurrentFile}
              disabled={isLoading || (!directoryHandle && storageType === 'local') || (storageType === 'webdav' && !isConnected)}
              title="保存当前文件"
            >
              💾 <span>保存</span>
            </button>
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          {isLoading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <div>加载中...</div>
            </div>
          ) : (
            (storageType === 'local' && directoryHandle) || (storageType === 'webdav' && webdavClient) ? 
              renderFileList() : (
              <div className="connect-prompt">
                {storageType === 'local' 
                  ? '请选择本地文件夹' 
                  : '请连接WebDAV服务器'}
              </div>
            )
          )}
        </div>
      )}
      <div className="resize-handle" onMouseDown={handleMouseDown}></div>
    </div>
  );
};

export default FileSidebar;
