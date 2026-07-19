import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'dist');
// Catalog stays pending across the chained session -> recommendations start so
// the intent run visibly has multiple destination requests in flight at commit.
const delays = { session: 120, recommendations: 120, catalog: 500 };
const contentTypes = {
	'.html': 'text/html; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
};

export async function createPocServer({ port = 0 } = {}) {
	if (!fs.existsSync(path.join(output, 'route-b-artifact.mjs')))
		throw new Error('POC build is missing; run pnpm run build');
	const runs = new Map();
	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? '/', 'http://nav-intent.local');
			if (url.pathname.startsWith('/api/')) {
				await handleApi({ request, response, runs, url });
				return;
			}
			serveAsset(url.pathname, response);
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
	if (!address || typeof address === 'string') throw new Error('POC server did not bind');
	return {
		origin: `http://127.0.0.1:${address.port}`,
		close: () =>
			new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			),
	};
}

async function handleApi({ request, response, runs, url }) {
	if (url.pathname === '/api/_reset') {
		if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST required' });
		const run = requiredRun(url);
		runs.set(run, {
			epoch: performance.now(),
			nextSequence: 0,
			renderStartMs: null,
			renderStartSequence: null,
			derivedAsyncComputedIds: null,
			events: [],
		});
		return sendJson(response, 200, { run });
	}
	const timeline = timelineFor(runs, requiredRun(url));
	if (url.pathname === '/api/_timeline') return sendJson(response, 200, publicTimeline(timeline));
	if (url.pathname === '/api/_render-start') {
		if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST required' });
		if (timeline.renderStartMs !== null)
			return sendJson(response, 409, { error: 'render start already recorded' });
		timeline.renderStartMs = elapsed(timeline);
		timeline.renderStartSequence = timeline.nextSequence++;
		return sendJson(response, 200, publicTimeline(timeline));
	}
	if (url.pathname === '/api/_derived') {
		if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST required' });
		const body = await readJson(request);
		if (
			!Array.isArray(body.asyncComputedIds) ||
			body.asyncComputedIds.some((id) => typeof id !== 'string')
		)
			return sendJson(response, 400, { error: 'asyncComputedIds must be a string array' });
		timeline.derivedAsyncComputedIds = body.asyncComputedIds;
		return sendJson(response, 200, publicTimeline(timeline));
	}

	const name = url.pathname.slice('/api/'.length);
	if (!(name in delays)) return sendJson(response, 404, { error: 'unknown endpoint' });
	const event = {
		name,
		startMs: elapsed(timeline),
		startSequence: timeline.nextSequence++,
		settledMs: null,
	};
	timeline.events.push(event);
	await new Promise((resolve) => setTimeout(resolve, delays[name]));
	event.settledMs = elapsed(timeline);
	if (name === 'session') return sendJson(response, 200, { user: 'ada' });
	if (name === 'recommendations') {
		if (url.searchParams.get('u') !== 'ada')
			return sendJson(response, 400, { error: 'recommendations require the session user' });
		return sendJson(response, 200, { items: ['Signals', 'Compilers'] });
	}
	if (url.searchParams.get('section') !== 'handbook')
		return sendJson(response, 400, { error: 'catalog requires its compiled state seed' });
	return sendJson(response, 200, { title: 'Markless Handbook' });
}

function serveAsset(pathname, response) {
	const relative = pathname === '/' || pathname === '/b' ? 'index.html' : pathname.slice(1);
	const file = path.resolve(output, relative);
	if (
		!file.startsWith(`${output}${path.sep}`) ||
		!fs.statSync(file, { throwIfNoEntry: false })?.isFile()
	) {
		response.statusCode = 404;
		response.end('not found');
		return;
	}
	response.setHeader(
		'content-type',
		contentTypes[path.extname(file)] ?? 'application/octet-stream',
	);
	response.end(fs.readFileSync(file));
}

function requiredRun(url) {
	const run = url.searchParams.get('run');
	if (!run) throw new Error('API request requires a run query parameter');
	return run;
}

function timelineFor(runs, run) {
	const timeline = runs.get(run);
	if (!timeline) throw new Error(`Unknown run ${run}; reset it first`);
	return timeline;
}

function elapsed(timeline) {
	return Number((performance.now() - timeline.epoch).toFixed(3));
}

function publicTimeline(timeline) {
	return {
		renderStartMs: timeline.renderStartMs,
		renderStartSequence: timeline.renderStartSequence,
		derivedAsyncComputedIds: timeline.derivedAsyncComputedIds,
		events: timeline.events,
	};
}

async function readJson(request) {
	let body = '';
	for await (const chunk of request) body += chunk;
	return JSON.parse(body);
}

function sendJson(response, status, value) {
	response.statusCode = status;
	response.setHeader('content-type', contentTypes['.json']);
	response.end(JSON.stringify(value));
}
