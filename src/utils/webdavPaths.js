/**
 * Recursively create WebDAV directories for a path (e.g. /a/b/c).
 * @param {import('webdav').WebDAVClient} client
 * @param {string} path
 */
export const createDirectoryRecursive = async (client, path) => {
  const pathParts = (path || '').split('/').filter(Boolean);
  let currentPath = '';

  for (const part of pathParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
    const exists = await client.exists(currentPath);
    if (!exists) {
      await client.createDirectory(currentPath);
    }
  }
};
