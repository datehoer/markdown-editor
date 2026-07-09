import React from 'react';

const PathBreadcrumbs = ({ path, storageType, onNavigate }) => {
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
        const partPath = '/' + parts.slice(0, index + 1).join('/');
        const isLast = index === parts.length - 1;

        return (
          <React.Fragment key={partPath}>
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

export default PathBreadcrumbs;
