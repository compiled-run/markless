import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const MIME = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
};

export async function createComputedChainServer({ clientDirectory, port = 0 }) {
	const clientRoot = path.resolve(clientDirectory);
	const server = createServer((request, response) => {
		try {
			const requestUrl = new URL(request.url ?? '/', 'http://bench.local');
			const relative = requestUrl.pathname === '/'
				? 'index.html'
				: decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
			const file = path.resolve(clientRoot, relative);
			if (!file.startsWith(`${clientRoot}${path.sep}`) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
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
	if (!address || typeof address === 'string') throw new Error('computed-chain server did not bind a TCP address');
	return {
		origin: `http://127.0.0.1:${address.port}`,
		declaredRequests: declaredBuildRequests(clientRoot),
		close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
	};
}

export function declaredBuildRequests(clientRoot) {
	const requests = [{ method: 'GET', path: '/', resourceType: 'document', kind: 'document' }];
	for (const file of walkFiles(clientRoot)) {
		const relative = path.relative(clientRoot, file).split(path.sep).join('/');
		if (relative === 'index.html') continue;
		const extension = path.extname(file);
		requests.push({
			method: 'GET',
			path: `/${relative}`,
			resourceType: extension === '.css' ? 'stylesheet' : extension === '.js' ? 'script' : 'other',
			kind: 'build-asset',
		});
	}
	return requests;
}

function walkFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const child = path.join(directory, entry.name);
			return entry.isDirectory() ? walkFiles(child) : [child];
		})
		.sort();
}
