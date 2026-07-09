import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import './FileSidebar.css';
import { createClient } from 'webdav';
import { isSupportedFileExtension } from '../utils/supportedFiles';
import { createDirectoryRecursive } from '../utils/webdavPaths';
import useSidebarResize from '../hooks/useSidebarResize';
import WebdavConnectForm from './sidebar/WebdavConnectForm';
import WebdavHistoryList from './sidebar/WebdavHistoryList';
import FileBrowser from './sidebar/FileBrowser';

const WEBDAV_HISTORY_KEY = 'webdav_history';
const WEBDAV_SESSION_PASSWORDS_KEY = 'webdav_session_passwords';

const webdavConnectionKey = (url, username) => `${username || ''}@${url || ''}`;

const loadSessionPasswords = () => {
  try {
    const raw = sessionStorage.getItem(WEBDAV_SESSION_PASSWORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const saveSessionPassword = (url, username, password) => {
  try {
    const map = loadSessionPasswords();
    map[webdavConnectionKey(url, username)] = password;
    sessionStorage.setItem(WEBDAV_SESSION_PASSWORDS_KEY, JSON.stringify(map));
  } catch (err) {
    console.error('保存会话密码失败:', err);
  }
};

const getSessionPassword = (url, username) => {
  const map = loadSessionPasswords();
  return map[webdavConnectionKey(url, username)] || '';
};

const clearSessionPassword = (url, username) => {
  try {
    const map = loadSessionPasswords();
    delete map[webdavConnectionKey(url, username)];
    sessionStorage.setItem(WEBDAV_SESSION_PASSWORDS_KEY, JSON.stringify(map));
  } catch (err) {
    console.error('清除会话密码失败:', err);
  }
};

const sanitizeHistoryEntries = (entries) => {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((item) => item && typeof item === 'object')
    .map(({ password, ...rest }) => ({
      ...rest,
      savePassword: Boolean(rest.savePassword),
    }));
};

const clearSessionPasswordIfUnused = (history, url, username) => {
  const stillExists = (history || []).some(
    (item) => item && item.url === url && item.username === username
  );
  if (!stillExists) {
    clearSessionPassword(url, username);
  }
};

const FileSidebar = forwardRef(({ 
  onFileSelect, 
  currentFilePath, 
  markdownContent, 
  documentTitle
}, ref) => {
  const [rootDirectory, setRootDirectory] = useState(null);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [directoryHandle, setDirectoryHandle] = useState(null);
  
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

  const {
    sidebarRef,
    sidebarWidth,
    setSidebarWidth,
    handleMouseDown,
  } = useSidebarResize({ isConnected, storageType });
  
  // 历史连接相关状态
  const [webdavHistory, setWebdavHistory] = useState([]);
  const [showWebdavHistory, setShowWebdavHistory] = useState(false);
  
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [folderMenuPosition, setFolderMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedItem, setSelectedItem] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');

  // 添加本地目录句柄缓存，用于导航
  const [directoryHandleCache, setDirectoryHandleCache] = useState({});

  // 加载WebDAV历史连接记录（迁移清除 localStorage 中的明文密码）
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(WEBDAV_HISTORY_KEY);
      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory);
        if (Array.isArray(parsedHistory)) {
          const cleaned = sanitizeHistoryEntries(parsedHistory);
          const hadPasswords = parsedHistory.some((item) => item && item.password);
          if (hadPasswords) {
            localStorage.setItem(WEBDAV_HISTORY_KEY, JSON.stringify(cleaned));
            console.info('已从 WebDAV 历史记录中移除明文密码（改用会话存储）');
          }
          setWebdavHistory(cleaned);
        }
      }
    } catch (err) {
      console.error('加载WebDAV历史记录失败:', err);
    }
  }, []);
  
  // 保存WebDAV历史连接记录（元数据进 localStorage；密码仅进 sessionStorage）
  const saveWebdavHistory = (config) => {
    try {
      const configToSave = {
        url: config.url,
        username: config.username,
        path: config.path,
        autoCreateDirectory: config.autoCreateDirectory,
        savePassword: Boolean(config.savePassword),
        label: `${config.username}@${config.url}${config.path}`,
        timestamp: new Date().getTime()
      };
      
      if (config.savePassword && config.password) {
        saveSessionPassword(config.url, config.username, config.password);
      } else {
        clearSessionPassword(config.url, config.username);
      }
      
      const existingIndex = webdavHistory.findIndex(
        item => item.url === config.url && item.username === config.username
      );
      
      let newHistory = [...webdavHistory];
      
      if (existingIndex >= 0) {
        newHistory[existingIndex] = configToSave;
      } else {
        newHistory.unshift(configToSave);
        
        if (newHistory.length > 5) {
          const evicted = newHistory.slice(5);
          newHistory = newHistory.slice(0, 5);
          evicted.forEach((item) => {
            if (item) {
              clearSessionPasswordIfUnused(newHistory, item.url, item.username);
            }
          });
        }
      }
      
      localStorage.setItem(WEBDAV_HISTORY_KEY, JSON.stringify(newHistory));
      setWebdavHistory(newHistory);
    } catch (err) {
      console.error('保存WebDAV历史记录失败:', err);
    }
  };
  
  // 从历史记录中删除WebDAV连接
  const removeWebdavHistory = (index) => {
    try {
      const removed = webdavHistory[index];
      const newHistory = [...webdavHistory];
      newHistory.splice(index, 1);

      if (removed) {
        clearSessionPasswordIfUnused(newHistory, removed.url, removed.username);
      }
      
      localStorage.setItem(WEBDAV_HISTORY_KEY, JSON.stringify(newHistory));
      setWebdavHistory(newHistory);
    } catch (err) {
      console.error('删除WebDAV历史记录失败:', err);
    }
  };
  
  // 从历史记录中选择连接
  const selectHistoryConnection = (config) => {
    const sessionPassword = getSessionPassword(config.url, config.username);
    setWebdavConfig({
      ...webdavConfig,
      url: config.url,
      username: config.username,
      path: config.path,
      autoCreateDirectory: config.autoCreateDirectory || false,
      savePassword: config.savePassword || false,
      password: sessionPassword || config.password || ''
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
        // 本地文件系统删除
        if (item.type === 'directory') {
          await item.handle.remove({ recursive: true });
        } else {
          await item.handle.remove();
        }
        
        // 从缓存中移除已删除的目录句柄
        if (item.type === 'directory') {
          const updatedCache = { ...directoryHandleCache };
          delete updatedCache[item.path];
          setDirectoryHandleCache(updatedCache);
        }
        
        // 刷新当前目录
        const currentDirHandle = directoryHandleCache[currentPath] || directoryHandle;
        await loadDirectoryContents(currentDirHandle);
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
            await createDirectoryRecursive(client, webdavConfig.path);
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
          await createDirectoryRecursive(client, path);
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
          } else if (item.type === 'file' && isSupportedFileExtension(item.filename)) {
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
          if (isSupportedFileExtension(entry.name)) {
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

  const handleWebdavConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
    setWebdavConfig({
      ...webdavConfig,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleFileContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderMenuPosition({ x: e.clientX, y: e.clientY });
    setSelectedItem(item);
    setShowFolderMenu(true);
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
            await createDirectoryRecursive(webdavClient, parentPath);
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
            await createDirectoryRecursive(webdavClient, targetPath);
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

  // 上传本地文件到WebDAV
  const uploadLocalFile = async () => {
    if (storageType !== 'webdav' || !webdavClient) {
      setError('请先连接WebDAV服务器');
      return;
    }

    try {
      // 使用文件选择器选择本地文件
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.md,.txt,.json,.csv,.html,.css,.js,.ts,.jsx,.tsx,.py,.java,.cpp,.c,.h,.php,.xml,.yaml,.yml';
      
      input.onchange = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
          const targetPath = currentPath;
          
          // 检查目标路径是否存在
          const pathExists = await webdavClient.exists(targetPath);
          if (!pathExists && webdavConfig.autoCreateDirectory) {
            await createDirectoryRecursive(webdavClient, targetPath);
          } else if (!pathExists) {
            throw new Error(`目标路径不存在: ${targetPath}`);
          }
          
          // 上传所有选中的文件
          const uploadPromises = Array.from(files).map(async (file) => {
            const content = await file.text();
            const filePath = `${targetPath}/${file.name}`.replace(/\/+/g, '/');
            
            console.log(`正在上传文件: ${file.name} 到 ${filePath}`);
            await webdavClient.putFileContents(filePath, content, { overwrite: true });
            return file.name;
          });
          
          const uploadedFiles = await Promise.all(uploadPromises);
          
          // 刷新文件列表
          await loadWebdavContents(webdavClient, currentPath);
          
          alert(`成功上传 ${uploadedFiles.length} 个文件:\n${uploadedFiles.join('\n')}`);
        } catch (err) {
          console.error('上传文件失败:', err);
          setError('上传文件失败: ' + (err.message || '未知错误'));
        } finally {
          setIsLoading(false);
        }
      };
      
      input.click();
    } catch (err) {
      console.error('文件上传操作失败:', err);
      setError('文件上传操作失败: ' + (err.message || '未知错误'));
    }
  };

  // 从WebDAV下载文件到本地
  const downloadWebdavFile = async (item) => {
    if (storageType !== 'webdav' || !webdavClient) {
      setError('请先连接WebDAV服务器');
      return;
    }

    if (item.type === 'directory') {
      setError('无法下载文件夹，请选择文件');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`正在下载文件: ${item.path}`);
      
      // 从WebDAV获取文件内容
      const content = await webdavClient.getFileContents(item.path, { format: 'text' });
      
      // 创建下载链接
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(`文件下载完成: ${item.name}`);
    } catch (err) {
      console.error('下载文件失败:', err);
      setError('下载文件失败: ' + (err.message || '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 保存当前文档。
   * options: { content, path, fileName, requireWebdav }
   */
  const saveCurrentFile = async (options = {}) => {
    const content = options.content !== undefined ? options.content : markdownContent;
    const fileName = options.fileName || `${documentTitle}.md`;

    if (options.requireWebdav && (storageType !== 'webdav' || !webdavClient)) {
      const msg = '当前文档来自 WebDAV，但侧边栏未连接 WebDAV，无法保存到远程';
      setError(msg);
      return { success: false, error: msg };
    }

    if (storageType === 'local') {
      if (!directoryHandle) {
        setError('请先选择一个文件夹');
        return { success: false, error: '请先选择一个文件夹' };
      }
      
      try {
        const targetHandle = directoryHandleCache[currentPath] || directoryHandle;
        
        const fileHandle = await targetHandle.getFileHandle(fileName, { create: true });
        
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        
        await navigateTo(currentPath);
        
        onFileSelect({
          content,
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
        const filePath = options.path || `${currentPath}/${fileName}`.replace(/\/+/g, '/');
        const parentPath = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
        const parentExists = await webdavClient.exists(parentPath);
        
        if (!parentExists && webdavConfig.autoCreateDirectory) {
          try {
            await createDirectoryRecursive(webdavClient, parentPath);
          } catch (createDirErr) {
            throw new Error(`自动创建目录失败: ${createDirErr.message}`);
          }
        } else if (!parentExists) {
          throw new Error(`父目录不存在: ${parentPath}`);
        }
        
        await webdavClient.putFileContents(filePath, content, { overwrite: true });
        
        const listPath = parentPath || '/';
        await navigateTo(listPath);
        
        const savedName = filePath.split('/').filter(Boolean).pop() || fileName;
        onFileSelect({
          content,
          name: savedName,
          path: filePath,
          handle: { path: filePath, isWebdav: true },
          isWebdav: true
        });
        
        return {
          success: true,
          fileName: savedName,
          path: filePath,
          handle: { path: filePath, isWebdav: true }
        };
      } catch (err) {
        console.error('保存WebDAV文件失败:', err);
        setError(err.message || '保存WebDAV文件失败');
        return { success: false, error: err.message };
      }
    }

    return { success: false, error: '未连接任何存储' };
  };

  const saveCurrentFileRef = useRef(saveCurrentFile);
  saveCurrentFileRef.current = saveCurrentFile;

  useImperativeHandle(ref, () => ({
    saveFile: (options) => saveCurrentFileRef.current(options),
  }), []);

  // 断开WebDAV连接
  const disconnectWebdav = () => {
    if (storageType === 'webdav' && webdavClient) {
      setWebdavClient(null);
      setIsConnected(false);
      setFiles([]);
      setCurrentPath('/');

      if (!webdavConfig.savePassword) {
        clearSessionPassword(webdavConfig.url, webdavConfig.username);
        setWebdavConfig((prev) => ({ ...prev, password: '' }));
      }

      setStorageType('local');
      setError(null);
    }
  };

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
        <WebdavConnectForm
          webdavConfig={webdavConfig}
          onChange={handleWebdavConfigChange}
          onConnect={connectWebdav}
          onCancel={() => setShowWebdavForm(false)}
          onShowHistory={toggleWebdavHistory}
          isLoading={isLoading}
        />
      ) : showWebdavHistory ? (
        <WebdavHistoryList
          webdavHistory={webdavHistory}
          onSelect={selectHistoryConnection}
          onRemove={removeWebdavHistory}
          onBack={toggleWebdavHistory}
          onNewConnection={() => {
            setShowWebdavHistory(false);
            setShowWebdavForm(true);
          }}
        />
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
            {storageType === 'webdav' && isConnected && (
              <button 
                className="action-button"
                onClick={uploadLocalFile}
                disabled={isLoading}
                title="上传本地文件到WebDAV"
              >
                📤 <span>上传文件</span>
              </button>
            )}
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
            <FileBrowser
              storageType={storageType}
              directoryHandle={directoryHandle}
              webdavClient={webdavClient}
              currentPath={currentPath}
              files={files}
              currentFilePath={currentFilePath}
              showFolderMenu={showFolderMenu}
              selectedItem={selectedItem}
              folderMenuPosition={folderMenuPosition}
              onNavigateUp={navigateUp}
              onRefresh={refreshFileList}
              onNavigate={navigateTo}
              onOpenFile={openFile}
              onContextMenu={handleFileContextMenu}
              onRename={renameItem}
              onDelete={deleteItem}
              onDownload={downloadWebdavFile}
            />
          )}
        </div>
      )}
      <div className="resize-handle" onMouseDown={handleMouseDown}></div>
    </div>
  );
});

export default FileSidebar;
