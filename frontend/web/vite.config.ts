import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function gitInfo(arg: string, fallback: string): string {
  try {
    return execSync(`git ${arg}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

// Baked into the bundle so a deployed build can be identified by branch,
// commit, base and build time (see src/version.ts / ProfileMenu footer).
const buildInfo = {
  appVersion: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string,
  gitBranch: gitInfo('rev-parse --abbrev-ref HEAD', 'unknown'),
  gitCommit: gitInfo('rev-parse --short HEAD', 'unknown'),
  gitBase: gitInfo('merge-base main HEAD', ''),
  buildTime: new Date().toISOString().replace(/[:.]/g, '-'),
};
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

function localPreviewAuth(): Plugin {
  return {
    name: 'kippa-local-preview-auth',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__visual-preview-token', async (req, res) => {
        const remoteAddress = req.socket.remoteAddress || '';
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)) {
          res.statusCode = 403;
          res.end('Local preview only');
          return;
        }
        try {
          const [{ applicationDefault, getApps, initializeApp }, { getAuth }] = await Promise.all([
            import('firebase-admin/app'),
            import('firebase-admin/auth'),
          ]);
          const previewProjectId = process.env.KIPPA_PREVIEW_PROJECT_ID;
          const previewApp = getApps().find(app => app.name === 'kippa-local-preview-v2')
            || initializeApp({
              credential: applicationDefault(),
              ...(previewProjectId ? { projectId: previewProjectId } : {}),
            }, 'kippa-local-preview-v2');
          const uid = process.env.KIPPA_PREVIEW_UID || 'kippa-visual-demo';
          const token = await getAuth(previewApp).createCustomToken(uid);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ token }));
        } catch (error) {
          server.config.logger.error(`Local preview authentication failed: ${error instanceof Error ? error.message : String(error)}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Preview authentication failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildInfo.appVersion),
    __GIT_BRANCH__: JSON.stringify(buildInfo.gitBranch),
    __GIT_COMMIT__: JSON.stringify(buildInfo.gitCommit),
    __GIT_BASE__: JSON.stringify(buildInfo.gitBase ? gitInfo(`rev-parse --short ${buildInfo.gitBase}`, 'unknown') : 'unknown'),
    __BUILD_TIME__: JSON.stringify(buildInfo.buildTime),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    localPreviewAuth(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/icon.svg',
        'icons/icon-dark.svg',
        'icons/apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-192.png',
        'icons/maskable-512.png',
        'icons/maskable.svg'
      ],
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000,
        importScripts: ['/firebase-messaging-sw.js']
      }
    }),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three') || id.includes('postprocessing')) {
              return 'three-vendor';
            }
            if (id.includes('gsap')) {
              return 'gsap-vendor';
            }
            if (id.includes('@mui/x-charts')) {
              return 'mui-x-charts-vendor';
            }
            if (id.includes('@mui/x-date-pickers')) {
              return 'mui-x-date-vendor';
            }
            if (id.includes('firebase')) {
              return 'firebase-vendor';
            }
            if (id.includes('/react-router')) {
              return 'router-vendor';
            }
            if (
              id.includes('/react/')
              || id.includes('/react-dom/')
              || id.includes('/scheduler/')
              || id.includes('/@mui/material/')
              || id.includes('/@mui/system/')
              || id.includes('/@mui/icons-material/')
              || id.includes('/@emotion/')
            ) {
              return 'ui-framework-vendor';
            }
            if (
              id.includes('/@tanstack/react-query/')
              || id.includes('/notistack/')
            ) {
              return 'app-runtime-vendor';
            }
          }
        }
      }
    }
  }
});
