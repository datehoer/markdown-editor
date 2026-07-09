import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Drag-to-resize sidebar width, persisted to localStorage.
 * Width is written to localStorage on drag end (and for non-drag updates),
 * not on every mousemove, to avoid main-thread jank.
 */
export default function useSidebarResize({
  isConnected = false,
  storageType = 'local',
  defaultWidth = 250,
  minWidthLocal = 180,
  minWidthWebdav = 220,
} = {}) {
  const sidebarRef = useRef(null);
  const [sidebarWidth, setSidebarWidth] = useState(defaultWidth);
  const isDraggingRef = useRef(false);
  const widthRef = useRef(defaultWidth);

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDraggingRef.current || !sidebarRef.current) return;

      const newWidth = e.pageX;
      const minWidth =
        isConnected && storageType === 'webdav' ? minWidthWebdav : minWidthLocal;

      if (newWidth >= minWidth) {
        setSidebarWidth(newWidth);
        widthRef.current = newWidth;
        sidebarRef.current.style.width = `${newWidth}px`;
        sidebarRef.current.dataset.compact = newWidth < 240 ? 'true' : 'false';
      }
    },
    [isConnected, storageType, minWidthLocal, minWidthWebdav]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      if (widthRef.current >= minWidthLocal) {
        localStorage.setItem('sidebar_width', widthRef.current.toString());
      }
    } catch (err) {
      console.error('保存侧边栏宽度失败:', err);
    }
    window.dispatchEvent(new Event('resize'));
  }, [minWidthLocal]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    try {
      const savedWidth = localStorage.getItem('sidebar_width');
      if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (!isNaN(width) && width >= minWidthLocal) {
          setSidebarWidth(width);
          widthRef.current = width;
        }
      }
    } catch (err) {
      console.error('加载侧边栏宽度失败:', err);
    }
  }, [minWidthLocal]);

  // Persist programmatic width changes (e.g. WebDAV auto-expand); skip while dragging
  useEffect(() => {
    widthRef.current = sidebarWidth;
    if (!isDraggingRef.current && sidebarWidth >= minWidthLocal) {
      try {
        localStorage.setItem('sidebar_width', sidebarWidth.toString());
      } catch (err) {
        console.error('保存侧边栏宽度失败:', err);
      }
      if (sidebarRef.current) {
        sidebarRef.current.dataset.compact = sidebarWidth < 240 ? 'true' : 'false';
      }
    }
  }, [sidebarWidth, minWidthLocal]);

  useEffect(() => {
    const updateButtonText = () => {
      if (sidebarRef.current) {
        const width = sidebarRef.current.offsetWidth;
        sidebarRef.current.dataset.compact = width < 240 ? 'true' : 'false';
      }
    };

    updateButtonText();

    const observer = new ResizeObserver(() => {
      updateButtonText();
    });

    if (sidebarRef.current) {
      observer.observe(sidebarRef.current);
    }

    window.addEventListener('resize', updateButtonText);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateButtonText);
    };
  }, []);

  return {
    sidebarRef,
    sidebarWidth,
    setSidebarWidth,
    handleMouseDown,
  };
}
