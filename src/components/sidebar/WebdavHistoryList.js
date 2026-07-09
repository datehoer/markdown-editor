import React from 'react';

const WebdavHistoryList = ({
  webdavHistory,
  onSelect,
  onRemove,
  onBack,
  onNewConnection,
}) => {
  return (
    <div className="webdav-history">
      <h4>历史连接</h4>

      {webdavHistory.length === 0 ? (
        <div className="empty-history">暂无历史连接记录</div>
      ) : (
        <div className="history-list">
          {webdavHistory.map((item, index) => (
            <div key={`${item.url}-${item.username}-${index}`} className="history-item">
              <div
                className="history-item-content"
                onClick={() => onSelect(item)}
              >
                <div className="history-item-label">{item.label}</div>
                <div className="history-item-url">{item.url}</div>
              </div>
              <button
                className="history-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(index);
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
        <button className="sidebar-button secondary-button" onClick={onBack}>
          返回
        </button>
        <button className="sidebar-button primary-button" onClick={onNewConnection}>
          新建连接
        </button>
      </div>
    </div>
  );
};

export default WebdavHistoryList;
