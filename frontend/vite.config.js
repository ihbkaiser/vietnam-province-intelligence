import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var _b, _c;
    var mode = _a.mode;
    var currentDir = path.dirname(fileURLToPath(import.meta.url));
    var workspaceRoot = path.resolve(currentDir, '..');
    var env = loadEnv(mode, workspaceRoot, '');
    return {
        envDir: workspaceRoot,
        plugins: [react()],
        define: {
            'import.meta.env.VITE_OPENMAP_API_KEY': JSON.stringify((_c = (_b = env.VITE_OPENMAP_API_KEY) !== null && _b !== void 0 ? _b : env.OPENMAP_API_KEY) !== null && _c !== void 0 ? _c : '')
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
