import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { planModulePreloadUrls } from '@markless/bundler/preload';

const MIME = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
};

export async function createAsyncWaterfallServer({ clientDirectory, renderApp, port = 0 }) {
	const clientRoot = path.resolve(clientDirectory);
	const template = fs.readFileSync(path.join(clientRoot, 'index.html'), 'utf8');
	const buildDirectory = path.join(clientRoot, 'build');
	const resumeAsset = fs.readdirSync(buildDirectory)
		.filter((name) => name.endsWith('.js'))
		.find((name) => fs.readFileSync(path.join(buildDirectory, name), 'utf8').includes('resumeContainerEvent'));
	if (!resumeAsset) throw new Error('async-waterfall client build contains no resume entry chunk');
	const bundleGraph = JSON.parse(fs.readFileSync(path.join(buildDirectory, 'bundle-graph.json'), 'utf8'));
	const modulePreloads = planModulePreloadUrls({ bundleGraph, roots: [resumeAsset], base: '/build/' });
	const resumeModuleUrl = '/build/' + resumeAsset;
	const server = createServer(async (request, response) => {
		try {
			const requestUrl = new URL(request.url ?? '/', 'http://bench.local');
			if (requestUrl.pathname === '/') {
				const body = await renderApp({ resumeModuleUrl, modulePreloads });
				const document = template.replace('<!--ssr-body-->', body).replace('<!--ssr-head-->', '');
				response.setHeader('Content-Type', MIME['.html']);
				response.end(document);
				return;
			}
			const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
			const file = path.resolve(clientRoot, relative);
			if (!file.startsWith(clientRoot + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
				response.statusCode = 404;
				response.end('not found');
				return;
			}
			response.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
			response.end(fs.readFileSync(file));
		} catch (error) {
			response.statusCode = 500;
			response.end(error instanceof Error ? error.message : String(error));
		}
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('async-waterfall server did not bind a TCP address');
	return {
		origin: 'http://127.0.0.1:' + address.port,
		close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
	};
}
