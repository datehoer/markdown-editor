import React from 'react';

const FileItemMenu = ({ item, position, onRename, onDelete, onDownload, storageType }) => {
  return (
    <div
      className="file-context-menu"
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
      }}
    >
      <div className="context-menu-item" onClick={() => onRename(item)}>
        <span>✏️ 重命名</span>
      </div>
      {storageType === 'webdav' && item.type === 'file' && (
        <div className="context-menu-item" onClick={() => onDownload(item)}>
          <span>⬇️ 下载到本地</span>
        </div>
      )}
      <div className="context-menu-item" onClick={() => onDelete(item)}>
        <span>🗑️ 删除</span>
      </div>
    </div>
  );
};

export default FileItemMenu;
