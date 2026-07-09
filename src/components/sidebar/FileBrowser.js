import React from 'react';
import PathBreadcrumbs from './PathBreadcrumbs';
import FileItemMenu from './FileItemMenu';

const FileBrowser = ({
  storageType,
  directoryHandle,
  webdavClient,
  currentPath,
  files,
  currentFilePath,
  showFolderMenu,
  selectedItem,
  folderMenuPosition,
  onNavigateUp,
  onRefresh,
  onNavigate,
  onOpenFile,
  onContextMenu,
  onRename,
  onDelete,
  onDownload,
}) => {
  const isValidState =
    (storageType === 'local' && directoryHandle) ||
    (storageType === 'webdav' && webdavClient);

  if (!isValidState) {
    return (
      <div className="connect-prompt">
        {storageType === 'local' ? '请选择本地文件夹' : '请连接WebDAV服务器'}
      </div>
    );
  }

  return (
    <div className="file-browser-container">
      <div className="path-navigation">
        <button
          className="nav-button"
          onClick={onNavigateUp}
          disabled={currentPath === '/' || currentPath === '/webdav'}
          title="返回上一级"
        >
          ⬆️
        </button>

        <button className="nav-button" onClick={onRefresh} title="刷新">
          🔄
        </button>

        <PathBreadcrumbs
          path={currentPath}
          storageType={storageType}
          onNavigate={onNavigate}
        />
      </div>

      <div className="file-items-container">
        {files.length > 0 ? (
          <div className="file-list">
            {files.map((item) => (
              <div
                key={item.path}
                className={`file-list-item ${
                  item.type === 'file' && currentFilePath === item.path ? 'active' : ''
                }`}
                onContextMenu={(e) => onContextMenu(e, item)}
              >
                {item.type === 'directory' ? (
                  <div
                    className="directory-item"
                    onClick={() => onNavigate(item.path)}
                  >
                    <div className="folder-icon">📁</div>
                    <div className="folder-name">{item.name}</div>
                  </div>
                ) : (
                  <div
                    className="file-item"
                    onClick={() => onOpenFile(item.handle)}
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
                onRename={onRename}
                onDelete={onDelete}
                onDownload={onDownload}
                storageType={storageType}
              />
            )}
          </div>
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

export default FileBrowser;
