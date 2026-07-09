import { render, screen } from '@testing-library/react';
import App from './App';

// ESM packages used by the editor are not transformed by CRA's Jest by default
jest.mock('react-markdown', () => {
  return function MockReactMarkdown({ children }) {
    return <div data-testid="markdown-preview">{children}</div>;
  };
});
jest.mock('react-syntax-highlighter', () => ({
  PrismLight: function MockHighlighter({ children }) {
    return <pre data-testid="syntax-highlighter">{children}</pre>;
  },
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  coldarkDark: {},
}));
jest.mock('remark-gfm', () => () => {});
jest.mock('html2canvas', () => jest.fn());
jest.mock('html2pdf.js', () => jest.fn());
jest.mock('webdav', () => ({
  createClient: jest.fn(),
}));

test('renders markdown editor shell', () => {
  render(<App />);

  expect(screen.getByPlaceholderText(/untitled document/i)).toBeInTheDocument();
  expect(screen.getByText('文件浏览器')).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/type your markdown here/i)).toBeInTheDocument();
  expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
});

test('shows save status in the header', () => {
  render(<App />);
  // Accept current and pre-#1 status labels (Saved / Unsaved / Editing...)
  expect(screen.getByText(/saved|unsaved|editing/i)).toBeInTheDocument();
});

test('links to the GitHub repository from the header', () => {
  render(<App />);
  const githubLink = screen.getByRole('link', { name: /view on github/i });
  expect(githubLink).toHaveAttribute(
    'href',
    'https://github.com/datehoer/markdown-editor'
  );
  expect(githubLink).toHaveAttribute('target', '_blank');
  expect(githubLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
});
