import { defineConfig, type Plugin } from 'vite';

// Strict CSP for the production build only: the dev server injects inline styles for HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "worker-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
});

// Relative base so the build works both at the GitHub Pages sub-path and locally.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  plugins: [contentSecurityPolicy()],
});
