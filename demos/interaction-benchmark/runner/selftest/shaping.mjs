// Measures the proxy's link emulation against its analytic model, from Node (HTTP/2 client) and from each browser.
import http2 from 'node:http2';
import { launch } from '../lib/session.mjs';

const WINDOW = 16 * 1024 * 1024;
export const ASSET_BYTES = 250 * 1024;
export const UPLOAD_BYTES = 32 * 1024;

export function expectations(network) {
	const rtt = network.latencyMs;
	const down = (bytes) => (bytes * 8) / network.downloadKbps;
	const up = (bytes) => (bytes * 8) / network.uploadKbps;
	return {
		handshakeMs: 2 * rtt,
		tinyMs: rtt,
		coldTinyMs: 3 * rtt,
		assetMs: rtt + down(ASSET_BYTES),
		uploadMs: rtt + up(UPLOAD_BYTES),
	};
}

export async function measureNode(origin) {
	const t0 = performance.now();
	const session = http2.connect(origin, { rejectUnauthorized: false, settings: { initialWindowSize: WINDOW } });
	session.on('error', () => {});
	await new Promise((resolve, reject) => {
		session.once('connect', resolve);
		session.once('error', reject);
	});
	session.setLocalWindowSize(WINDOW);
	const handshakeMs = performance.now() - t0;
	const request = (path, body) =>
		new Promise((resolve, reject) => {
			const start = performance.now();
			const req = session.request({ ':path': path, ':method': body ? 'POST' : 'GET', 'accept-encoding': 'identity' });
			let bytes = 0;
			req.on('data', (d) => (bytes += d.length));
			req.on('end', () => resolve({ ms: performance.now() - start, bytes }));
			req.on('error', reject);
			req.end(body);
		});
	const first = await request('/bytes/16');
	const coldTinyMs = performance.now() - t0;
	const tiny = await request('/bytes/16');
	const asset = await request(`/bytes/${ASSET_BYTES}`);
	const upload = await request('/sink', Buffer.alloc(UPLOAD_BYTES, 1));
	session.close();
	return { handshakeMs, coldTinyMs, firstTinyOnNewConnectionMs: first.ms, tinyMs: tiny.ms, assetMs: asset.ms, assetBytes: asset.bytes, uploadMs: upload.ms };
}

/** Resource Timing of an incompressible asset fetched on the page's already-open connection. */
export async function measureBrowser(browserName, origin) {
	const browser = await launch(browserName);
	try {
		const context = await browser.newContext({ ignoreHTTPSErrors: true });
		const page = await context.newPage();
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		return await page.evaluate(async (bytes) => {
			const url = `/bytes/${bytes}?t=${Math.random()}`;
			const start = performance.now();
			const buf = await (await fetch(url, { cache: 'no-store' })).arrayBuffer();
			const fetchMs = performance.now() - start;
			const entry = performance.getEntriesByType('resource').find((e) => e.name.includes(url));
			const tinyStart = performance.now();
			await (await fetch(`/bytes/16?t=${Math.random()}`, { cache: 'no-store' })).arrayBuffer();
			return { assetMs: fetchMs, assetBytes: buf.byteLength, resourceTimingMs: entry ? entry.responseEnd - entry.requestStart : null, tinyMs: performance.now() - tinyStart, protocol: entry?.nextHopProtocol ?? null };
		}, ASSET_BYTES);
	} finally {
		await browser.close();
	}
}
