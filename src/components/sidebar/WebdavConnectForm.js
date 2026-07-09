import React from 'react';

const WebdavConnectForm = ({
  webdavConfig,
  onChange,
  onConnect,
  onCancel,
  onShowHistory,
  isLoading,
}) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onConnect();
  };

  return (
    <form className="webdav-form" onSubmit={handleSubmit}>
      <h4>连接WebDAV服务器</h4>

      <div className="form-group">
        <label>服务器地址:</label>
        <input
          type="url"
          name="url"
          value={webdavConfig.url}
          onChange={onChange}
          placeholder="https://example.com/dav"
        />
      </div>

      <div className="form-group">
        <label>用户名:</label>
        <input
          type="text"
          name="username"
          value={webdavConfig.username}
          onChange={onChange}
        />
      </div>

      <div className="form-group">
        <label>密码:</label>
        <input
          type="password"
          name="password"
          value={webdavConfig.password}
          onChange={onChange}
        />
      </div>

      <div className="form-group">
        <label>初始路径:</label>
        <input
          type="text"
          name="path"
          value={webdavConfig.path}
          onChange={onChange}
          placeholder="/webdav"
        />
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="autoCreateDirectory"
            checked={webdavConfig.autoCreateDirectory}
            onChange={onChange}
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
            onChange={onChange}
          />
          记住密码（仅本次浏览器会话，关闭标签页后清除；不会写入 localStorage）
        </label>
      </div>

      <div className="form-actions form-actions-triple">
        <button
          type="button"
          className="sidebar-button secondary-button"
          onClick={onShowHistory}
          title="返回历史连接"
        >
          历史
        </button>
        <button
          type="button"
          className="sidebar-button secondary-button"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="submit"
          className="sidebar-button primary-button"
          disabled={isLoading}
        >
          连接
        </button>
      </div>
    </form>
  );
};

export default WebdavConnectForm;
