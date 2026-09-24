import { defineConfig, type AdapterServeFunction } from '@ripple-ts/vite-plugin';
import { serve, runtime } from '@ripple-ts/adapter-vercel';
import { routes } from './src/routes.ts';

// The adapter's default host `localhost` binds only ::1 on macOS; listen on every interface instead.
const serveAllInterfaces: AdapterServeFunction = (handler, options) =>
	serve(handler, { hostname: process.env.HOST ?? '::', ...options });

export default defineConfig({
	build: { outDir: 'dist' },
	adapter: { serve: serveAllInterfaces, runtime },
	router: { routes },
});
