/** File extensions the editor can open and list. */
export const SUPPORTED_FILE_EXTENSIONS = [
  '.md',
  '.txt',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
];

export const isSupportedFileExtension = (filename) => {
  if (typeof filename !== 'string') return false;
  return SUPPORTED_FILE_EXTENSIONS.some((ext) => filename.endsWith(ext));
};
