import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { coldarkDark as SyntaxHighlighterStyle  } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import html2pdf from 'html2pdf.js';
import FileSidebar from './FileSidebar';
import { unescapePastedText } from '../utils/unescapePastedText';

import './MarkdownEditor.css';

const MarkdownEditor = () => {
  const [markdown, setMarkdown] = useState('# Hello, World!\n\nThis is a **Markdown** editor with _Apple-style_ UI.\n\n```javascript\nconst greeting = "Hello, world!";\nconsole.log(greeting);\n```\n\n- List item 1\n- List item 2\n- List item 3\n\n> This is a blockquote');
  const [title, setTitle] = useState('Untitled Document');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSaved, setIsSaved] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSettings, setExportSettings] = useState({
    format: 'png',
    quality: 0.9,
    scale: 2,
    orientation: 'portrait',
    unit: 'mm',
    pageSize: 'a4',
  });
  
  // History states for undo/redo
  const [history, setHistory] = useState([markdown]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isUndoRedo, setIsUndoRedo] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState(null);
  const [currentFileHandle, setCurrentFileHandle] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isWebdavFile, setIsWebdavFile] = useState(false);
  
  const previewRef = useRef(null);
  const editorRef = useRef(null);
  const fileSidebarRef = useRef(null);

  const saveCurrentFile = useCallback(async () => {
    // WebDAV：通过 FileSidebar ref 写入远程文件
    if (isWebdavFile) {
      if (!fileSidebarRef.current?.saveFile) {
        alert('WebDAV 保存接口不可用，请确认侧边栏已加载');
        return { success: false, error: 'WebDAV保存接口不可用' };
      }
      try {
        const result = await fileSidebarRef.current.saveFile({
          content: markdown,
          path: currentFilePath || undefined,
          fileName: `${title}.md`,
          // 防止侧边栏已切到本地时把 WebDAV 文档误写入本地文件夹
          requireWebdav: true,
        });
        if (result?.success) {
          setIsSaved(true);
          return { success: true };
        }
        throw new Error(result?.error || '保存WebDAV文件失败');
      } catch (err) {
        console.error('保存WebDAV文件失败:', err);
        alert(`保存失败: ${err.message}`);
        return { success: false, error: err.message };
      }
    }

    // 本地：已有文件句柄时直接覆写
    if (currentFileHandle && !isWebdavFile) {
      try {
        const writable = await currentFileHandle.createWritable();
        await writable.write(markdown);
        await writable.close();
        setIsSaved(true);
        return { success: true };
      } catch (err) {
        console.error('保存文件失败:', err);
        alert(`保存失败: ${err.message}`);
        return { success: false, error: err.message };
      }
    }

    // 已连接存储但尚未打开文件：委托侧边栏按标题新建/覆盖
    if (fileSidebarRef.current?.saveFile) {
      try {
        const result = await fileSidebarRef.current.saveFile({
          content: markdown,
          fileName: `${title}.md`,
        });
        if (result?.success) {
          setIsSaved(true);
          return { success: true };
        }
        throw new Error(result?.error || '保存失败');
      } catch (err) {
        console.error('保存文件失败:', err);
        alert(`保存失败: ${err.message}`);
        return { success: false, error: err.message };
      }
    }

    alert('请先从侧边栏选择保存位置或打开文件');
    return { success: false, error: '无文件句柄' };
  }, [currentFileHandle, markdown, isWebdavFile, title, currentFilePath]);

  // 草稿备份到 localStorage（不等于“已保存到文件”，故不修改 isSaved）
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('markdown-content', markdown);
      localStorage.setItem('markdown-title', title);
    }, 1000);

    return () => clearTimeout(timer);
  }, [markdown, title]);

  // Add to history when markdown changes (but not during undo/redo)
  useEffect(() => {
    if (!isUndoRedo && markdown !== history[historyIndex]) {
      // Add new state to history, truncate future if we're not at the end
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(markdown);
      
      // Limit history size to prevent memory issues
      if (newHistory.length > 100) {
        newHistory.shift();
      }
      
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
    
    // Reset undo/redo flag
    if (isUndoRedo) {
      setIsUndoRedo(false);
    }
  }, [markdown, history, historyIndex, isUndoRedo]);
  // 添加侧边栏宽度监听
  useEffect(() => {
    // 设置初始CSS变量
    document.documentElement.style.setProperty('--sidebar-width', '250px');
    
    // 使用ResizeObserver监听宽度变化
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target.classList.contains('file-sidebar')) {
          const width = entry.contentRect.width;
          document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
        }
      }
    });
    
    // 延迟观察，确保组件已经挂载
    const timer = setTimeout(() => {
      const sidebarElement = document.querySelector('.file-sidebar');
      if (sidebarElement) {
        resizeObserver.observe(sidebarElement);
      }
    }, 100);
    
    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, []);
  
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };
  
  const handleFileSelect = (fileData) => {
    console.log("文件选择:", fileData); // 调试日志
    if (fileData && fileData.content) {
      setMarkdown(fileData.content);
      setTitle(fileData.name.replace(/\.md$/, ''));
      setCurrentFilePath(fileData.path);
      setCurrentFileHandle(fileData.handle);
      setIsWebdavFile(fileData.isWebdav || false);
      setIsSaved(true);
      
      // 为移动设备关闭侧边栏
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
    }
  };
  // Handle undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setIsUndoRedo(true);
      setHistoryIndex(historyIndex - 1);
      setMarkdown(history[historyIndex - 1]);
      setIsSaved(false);
    }
  }, [historyIndex, history]);
  
  // Handle redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setIsUndoRedo(true);
      setHistoryIndex(historyIndex + 1);
      setMarkdown(history[historyIndex + 1]);
      setIsSaved(false);
    }
  }, [historyIndex, history]);
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if the editor has focus
      if (document.activeElement === editorRef.current) {
        // Ctrl+Z or Command+Z for Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        }
        
        // Ctrl+Y or Command+Shift+Z for Redo
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+S or Command+S for Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentFile();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markdown, title, currentFileHandle, saveCurrentFile]);
  // Handle markdown change
  const handleMarkdownChange = (e) => {
    setMarkdown(e.target.value);
    setIsSaved(false);
  };

  /**
   * Paste handler: if clipboard is one line with literal "\\n" escapes
   * (common when copying from JSON / logs), convert them to real newlines.
   */
  const handleMarkdownPaste = (e) => {
    const raw = e.clipboardData?.getData('text/plain');
    if (!raw) return;

    const unescaped = unescapePastedText(raw);
    if (unescaped === raw) return; // nothing to fix — let browser paste normally

    e.preventDefault();

    const textarea = editorRef.current;
    if (!textarea) {
      setMarkdown(unescaped);
      setIsSaved(false);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = markdown.substring(0, start) + unescaped + markdown.substring(end);
    setMarkdown(next);
    setIsSaved(false);

    // Restore caret after React re-render
    const caret = start + unescaped.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };
  
  // Handle title change
  const handleTitleChange = (e) => {
    setTitle(e.target.value);
    setIsSaved(false);
  };
  
  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.body.classList.toggle('dark-mode');
  };

  const saveAsMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  // Insert markdown syntax
  const insertMarkdown = (syntax) => {
    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    
    let insertion = '';
    let cursorOffset = 0;
    
    switch(syntax) {
      case 'bold':
        insertion = `**${text.substring(start, end) || 'bold text'}**`;
        cursorOffset = 2;
        break;
      case 'italic':
        insertion = `_${text.substring(start, end) || 'italic text'}_`;
        cursorOffset = 1;
        break;
      case 'code':
        insertion = `\`${text.substring(start, end) || 'code'}\``;
        cursorOffset = 1;
        break;
      case 'codeblock':
        insertion = `\n\`\`\`\n${text.substring(start, end) || 'code block'}\n\`\`\`\n`;
        cursorOffset = 4;
        break;
      case 'link':
        insertion = `[${text.substring(start, end) || 'link text'}](url)`;
        cursorOffset = 1;
        break;
      case 'image':
        insertion = `![${text.substring(start, end) || 'alt text'}](image-url)`;
        cursorOffset = 2;
        break;
      case 'heading':
        insertion = `# ${text.substring(start, end) || 'Heading'}`;
        cursorOffset = 2;
        break;
      case 'list':
        insertion = `\n- ${text.substring(start, end) || 'List item'}\n`;
        cursorOffset = 3;
        break;
      case 'quote':
        insertion = `\n> ${text.substring(start, end) || 'Blockquote'}\n`;
        cursorOffset = 3;
        break;
      default:
        return;
    }
    
    const newText = text.substring(0, start) + insertion + text.substring(end);
    setMarkdown(newText);
    setIsSaved(false);
    
    // Set cursor position after update
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + insertion.length - cursorOffset;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };
  
  // Export preview as image
  const exportAsImage = async () => {
    if (!previewRef.current) return;
    
    try {
      const canvas = await html2canvas(previewRef.current, {
        scale: exportSettings.scale,
        backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
        useCORS: true,
      });
      
      const image = canvas.toDataURL(`image/${exportSettings.format}`, exportSettings.quality);
      
      // Create download link
      const link = document.createElement('a');
      link.href = image;
      link.download = `${title}.${exportSettings.format}`;
      link.click();
      
      setShowExportModal(false);
    } catch (error) {
      console.error('Error exporting image:', error);
      alert('Failed to export image. Please try again.');
    }
  };
  
  // Export preview as PDF
  const exportAsPDF = async () => {
    if (!previewRef.current) return;
    
    try {
      const element = previewRef.current.cloneNode(true);
      
      // Apply styles for PDF export
      element.style.padding = '20px';
      element.style.backgroundColor = isDarkMode ? '#1E1E1E' : '#FFFFFF';
      element.style.color = isDarkMode ? '#FFFFFF' : '#000000';
      
      const opt = {
        margin: 10,
        filename: `${title}.pdf`,
        image: { type: 'jpeg', quality: exportSettings.quality },
        html2canvas: { scale: exportSettings.scale, useCORS: true },
        jsPDF: { 
          unit: exportSettings.unit, 
          format: exportSettings.pageSize, 
          orientation: exportSettings.orientation 
        }
      };
      
      html2pdf().set(opt).from(element).save();
      setShowExportModal(false);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF. Please try again.');
    }
  };
  
  // Copy to clipboard
  const copyToClipboard = async () => {
    if (!previewRef.current) return;
    
    try {
      const canvas = await html2canvas(previewRef.current, {
        scale: exportSettings.scale,
        backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
        useCORS: true,
      });
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            alert('Image copied to clipboard!');
            setShowExportModal(false);
          } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            alert('Failed to copy to clipboard. Your browser may not support this feature.');
          }
        }
      });
    } catch (error) {
      console.error('Error creating image:', error);
    }
  };
  
  // Sync scrolling between editor and preview
  const syncScroll = (e) => {
    if (!previewRef.current || !editorRef.current) return;
    
    const editor = editorRef.current;
    const preview = previewRef.current;
    
    if (e.target === editor) {
      const percentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
      preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);
    } else if (e.target === preview) {
      const percentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
      editor.scrollTop = percentage * (editor.scrollHeight - editor.clientHeight);
    }
  };
  
  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : ''}`}>
      <header className="app-header">
        <div className="title-container">
          <button 
            className={`icon-button ${isSidebarOpen ? 'active' : ''}`} 
            onClick={toggleSidebar} 
            title={isSidebarOpen ? "隐藏文件浏览器" : "显示文件浏览器"}
          >
            📁
          </button>
          <input 
            type="text" 
            value={title} 
            onChange={handleTitleChange} 
            className="document-title"
            placeholder="Untitled Document"
          />
          <span className="save-status">{isSaved ? 'Saved' : 'Unsaved'}</span>
        </div>
        <div className="header-actions">
          <button 
            className="icon-button" 
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl+Z)"
          >
            ↩
          </button>
          <button 
            className="icon-button" 
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Ctrl+Y)"
          >
            ↪
          </button>
          <button 
            className="icon-button" 
            onClick={saveCurrentFile}
            title="保存 (Ctrl+S)"
          >
            💾
          </button>
          <button 
            className="icon-button" 
            onClick={toggleDarkMode}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? '🌞' : '🌙'}
          </button>
          <button 
            className="icon-button" 
            onClick={() => setShowExportModal(true)}
            title="导出为图片/PDF"
          >
            📷
          </button>
          <button 
            className="icon-button" 
            onClick={saveAsMarkdown}
            title="Download as Markdown"
          >
            ⬇️
          </button>
          <button 
            className="icon-button" 
            onClick={() => alert('Share functionality would go here')}
            title="Share"
          >
            📤
          </button>
        </div>
      </header>
      
      <div className="content-container">
        <div className={`file-sidebar-container ${isSidebarOpen ? 'open' : 'closed'}`}>
          <FileSidebar
            ref={fileSidebarRef}
            onFileSelect={handleFileSelect}
            currentFilePath={currentFilePath}
            markdownContent={markdown}
            documentTitle={title}
          />
        </div>
        <div className={`main-content ${isSidebarOpen ? 'with-sidebar' : 'full-width'}`}>
          <div className="editor-section">
            <div className="toolbar">
              <button onClick={() => insertMarkdown('heading')} title="Heading">H</button>
              <button onClick={() => insertMarkdown('bold')} title="Bold">B</button>
              <button onClick={() => insertMarkdown('italic')} title="Italic">I</button>
              <button onClick={() => insertMarkdown('code')} title="Inline Code">{'<>'}</button>
              <button onClick={() => insertMarkdown('codeblock')} title="Code Block">{'{ }'}</button>
              <button onClick={() => insertMarkdown('link')} title="Link">🔗</button>
              <button onClick={() => insertMarkdown('image')} title="Image">🖼️</button>
              <button onClick={() => insertMarkdown('list')} title="List">•</button>
              <button onClick={() => insertMarkdown('quote')} title="Quote">❝</button>
            </div>
            <textarea
              ref={editorRef}
              className="markdown-input"
              value={markdown}
              onChange={handleMarkdownChange}
              onPaste={handleMarkdownPaste}
              onScroll={syncScroll}
              placeholder="Type your Markdown here..."
            />
          </div>
          
          <div 
            className="preview-section"
            onScroll={syncScroll}
          >
            <div className="preview-content" ref={previewRef}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({node, inline, className, children, ...props}) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={SyntaxHighlighterStyle}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          </div>
          </div>
      </div>
      
      {showExportModal && (
        <div className="modal-overlay">
          <div className="export-modal">
            <h2>Export Document</h2>
            
            <div className="export-settings">
              <div className="setting-group">
                <label>Format:</label>
                <select 
                  value={exportSettings.format}
                  onChange={(e) => setExportSettings({...exportSettings, format: e.target.value})}
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
              
              <div className="setting-group">
                <label>Quality:</label>
                <input 
                  type="range" 
                  min="0.1" 
                  max="1.0" 
                  step="0.1"
                  value={exportSettings.quality}
                  onChange={(e) => setExportSettings({...exportSettings, quality: parseFloat(e.target.value)})}
                />
                <span>{Math.round(exportSettings.quality * 100)}%</span>
              </div>
              
              <div className="setting-group">
                <label>Scale:</label>
                <input 
                  type="range" 
                  min="1" 
                  max="4" 
                  step="0.5"
                  value={exportSettings.scale}
                  onChange={(e) => setExportSettings({...exportSettings, scale: parseFloat(e.target.value)})}
                />
                 <span>{exportSettings.scale}x</span>
              </div>
              
              {exportSettings.format === 'pdf' && (
                <div className="format-specific-settings">
                  <h3>PDF 设置</h3>
                  <div className="setting-group">
                    <label>方向:</label>
                    <select 
                      value={exportSettings.orientation}
                      onChange={(e) => setExportSettings({...exportSettings, orientation: e.target.value})}
                    >
                      <option value="portrait">纵向</option>
                      <option value="landscape">横向</option>
                    </select>
                  </div>
                  
                  <div className="setting-group">
                    <label>纸张大小:</label>
                    <select 
                      value={exportSettings.pageSize}
                      onChange={(e) => setExportSettings({...exportSettings, pageSize: e.target.value})}
                    >
                      <option value="a4">A4</option>
                      <option value="letter">Letter</option>
                      <option value="legal">Legal</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            
            <div className="export-preview">
              <h3>Preview</h3>
              <div className="preview-container">
                <div className="preview-scaled">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({node, inline, className, children, ...props}) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={SyntaxHighlighterStyle}
                            language={match[1]}
                            PreTag="div"
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {markdown.length > 300 ? markdown.substring(0, 300) + '...' : markdown}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
            
            <div className="modal-actions">
              <button onClick={() => setShowExportModal(false)}>取消</button>
              <button onClick={copyToClipboard}>复制到剪贴板</button>
              <button 
                className="primary-button" 
                onClick={exportSettings.format === 'pdf' ? exportAsPDF : exportAsImage}
              >
                下载 {exportSettings.format.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;