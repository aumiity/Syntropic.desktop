var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
var resolveConfig = {
    // The repo may contain emitted electron/*.js files next to the TS sources.
    // Prefer TS so Electron builds do not silently bundle stale generated JS.
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
};
export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        rollupOptions: {
                            external: ['better-sqlite3', 'electron'],
                        },
                    },
                    resolve: resolveConfig,
                },
            },
            {
                entry: 'electron/preload.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        rollupOptions: {
                            external: ['electron'],
                        },
                    },
                    resolve: resolveConfig,
                },
                onstart: function (options) {
                    options.reload();
                },
            },
        ]),
        renderer(),
    ],
    resolve: __assign(__assign({}, resolveConfig), { alias: {
            '@': path.resolve(__dirname, './src'),
        } }),
    optimizeDeps: {
        include: ['react-day-picker', 'lucide-react', 'framer-motion'],
    },
});
