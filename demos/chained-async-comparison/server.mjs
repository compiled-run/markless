import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const DELAYS = { session: 60, recommendations: 90, catalog: 80, reviews: 70 };
const MIME = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
};

export async function createComparisonServer({ port = 0 } = {}) {
	const runs = new Map();
	const markless = await loadMarklessFixture();
	const queryHandler = await loadStartHandler('tanstack-query');
	const loaderHandler = await loadStartHandler('tanstack-loader');
	let origin = '';

	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? '/', 'http://comparison.local');
			if (url.pathname.startsWith('/api/')) {
				await handleApi({ request, response, url, runs });
				return;
			}
			if (serveLaneAsset(url.pathname, response)) return;
			const lane = laneFromPath(url.pathname);
			if (!lane) {
				response.statusCode = 404;
				response.end('not found');
				return;
			}
			const run = url.searchParams.get('run') ?? 'untracked';
			const timeline = getRun(runs, run);
			if (timeline.pageStartMs === null) timeline.pageStartMs = elapsed(timeline);

			if (lane === 'markless') {
				const stream = await markless.renderAppStream({ apiOrigin: origin, run });
				const [prefix, suffix] = splitMarklessTemplate(markless.template);
				response.setHeader('Content-Type', MIME['.html']);
				response.write(prefix + stream.shell);
				for await (const chunk of stream.appends()) response.write(chunk);
				response.end(suffix);
				return;
			}

			const handler = lane === 'query' ? queryHandler : loaderHandler;
			const webResponse = await handler.fetch(toWebRequest(request, origin));
			await writeWebResponse(webResponse, response);
		} catch (error) {
			response.statusCode = 500;
			response.end(error instanceof Error ? (error.stack ?? error.message) : String(error));
		}
	});

	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string')
		throw new Error('comparison server did not bind a TCP address');
	origin = `http://127.0.0.1:${address.port}`;
	globalThis.__CHAINED_ASYNC_API_ORIGIN = origin;
	return {
		origin,
		close: () =>
			new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			),
	};
}

async function handleApi({ request, response, url, runs }) {
	if (url.pathname === '/api/_reset') {
		if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST required' });
		const run = requiredRun(url);
		runs.set(run, { epoch: performance.now(), pageStartMs: null, events: [] });
		return sendJson(response, 200, { run });
	}
	if (url.pathname === '/api/_timeline') {
		const run = requiredRun(url);
		const timeline = getRun(runs, run);
		return sendJson(response, 200, {
			run,
			pageStartMs: timeline.pageStartMs,
			events: timeline.events,
		});
	}

	const name = url.pathname.slice('/api/'.length);
	if (!(name in DELAYS)) return sendJson(response, 404, { error: 'unknown API endpoint' });
	const run = requiredRun(url);
	const timeline = getRun(runs, run);
	const event = { name, startMs: elapsed(timeline), settledMs: null };
	timeline.events.push(event);
	await delay(DELAYS[name]);
	event.settledMs = elapsed(timeline);
	if (name === 'session') return sendJson(response, 200, { user: 'ada', name: 'Ada' });
	if (name === 'recommendations') {
		if (url.searchParams.get('u') !== 'ada')
			return sendJson(response, 400, { error: 'recommendations require u=ada' });
		return sendJson(response, 200, { items: ['Signals', 'Compilers'] });
	}
	if (name === 'catalog') return sendJson(response, 200, { title: 'Markless Handbook' });
	return sendJson(response, 200, { count: 42 });
}

async function loadMarklessFixture() {
	const clientRoot = path.join(root, 'markless', 'dist', 'client');
	const serverEntry = path.join(root, 'markless', 'dist', 'server', 'entry-server.js');
	if (!fs.existsSync(serverEntry))
		throw new Error('Markless build is missing; run pnpm run build:markless');
	const module = await import(pathToFileURL(serverEntry).href);
	return {
		template: fs.readFileSync(path.join(clientRoot, 'index.html'), 'utf8'),
		renderAppStream: module.renderAppStream,
	};
}

function splitMarklessTemplate(template) {
	const marker = '<!--ssr-body-->';
	const markerAt = template.indexOf(marker);
	if (markerAt === -1) throw new Error('Markless template is missing the SSR body marker');
	const prefix = template.slice(0, markerAt).replace('<!--ssr-head-->', '');
	const suffix = template.slice(markerAt + marker.length);
	return [prefix, suffix];
}

async function loadStartHandler(directory) {
	const entry = path.join(root, directory, 'dist', 'server', 'server.js');
	if (!fs.existsSync(entry)) throw new Error(`${directory} build is missing; run pnpm run build`);
	return (await import(pathToFileURL(entry).href)).default;
}

function serveLaneAsset(pathname, response) {
	const match = /^\/(markless|query|loader)\/(.+)$/.exec(pathname);
	if (!match || !match[2].startsWith(match[1] === 'markless' ? 'build/' : 'assets/'))
		return false;
	const directory = match[1] === 'markless' ? 'markless' : `tanstack-${match[1]}`;
	const file = path.resolve(root, directory, 'dist', 'client', match[2]);
	const clientRoot = path.resolve(root, directory, 'dist', 'client');
	if (
		!file.startsWith(`${clientRoot}${path.sep}`) ||
		!fs.statSync(file, { throwIfNoEntry: false })?.isFile()
	) {
		response.statusCode = 404;
		response.end('not found');
		return true;
	}
	response.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
	response.end(fs.readFileSync(file));
	return true;
}

function laneFromPath(pathname) {
	if (pathname === '/markless' || pathname === '/markless/') return 'markless';
	if (pathname === '/query' || pathname === '/query/') return 'query';
	if (pathname === '/loader' || pathname === '/loader/') return 'loader';
	return null;
}

function toWebRequest(request, origin) {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
	}
	return new Request(new URL(request.url ?? '/', origin), { method: request.method, headers });
}

async function writeWebResponse(source, target) {
	target.statusCode = source.status;
	for (const [name, value] of source.headers) target.setHeader(name, value);
	target.end(Buffer.from(await source.arrayBuffer()));
}

function requiredRun(url) {
	const run = url.searchParams.get('run');
	if (!run) throw new Error('API request requires a run query parameter');
	return run;
}

function getRun(runs, run) {
	const timeline = runs.get(run);
	if (!timeline) throw new Error(`unknown run ${run}; call /api/_reset first`);
	return timeline;
}

function elapsed(timeline) {
	return Number((performance.now() - timeline.epoch).toFixed(3));
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sendJson(response, status, value) {
	response.statusCode = status;
	response.setHeader('Content-Type', MIME['.json']);
	response.end(JSON.stringify(value));
}
