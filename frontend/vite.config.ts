import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(currentDir, '..');
  const env = loadEnv(mode, workspaceRoot, '');

  return {
    envDir: workspaceRoot,
    plugins: [react()],
    define: {
      'import.meta.env.VITE_OPENMAP_API_KEY': JSON.stringify(env.VITE_OPENMAP_API_KEY ?? env.OPENMAP_API_KEY ?? '')
    },
    resolve: {
      // npm workspaces hoist packages lên root node_modules
      modules: [path.resolve(currentDir, 'node_modules'), path.resolve(workspaceRoot, 'node_modules'), 'node_modules']
    },
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true
        }
      }
    }
  };
});
