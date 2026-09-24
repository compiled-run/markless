import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

const noise = crypto.randomBytes(1024 * 1024);
const template = fs.readFileSync(new URL('./fixture.html', import.meta.url), 'utf8');

/** Plain-JS contract subset. `step` 2 makes the counter wrong so the correctness suite must fail; `ignoreClicksMs` drops counter clicks that land that early. */
export function startFixture({ port, step = 1, slowScriptMs = 600, ignoreClicksMs = 0 }) {
	const html = template.replace('__STEP__', String(step)).replace('__IGNORE_CLICKS_MS__', String(ignoreClicksMs));
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, 'http://x');
		const bytes = url.pathname.match(/^\/bytes\/(\d+)$/);
		if (bytes && Number(bytes[1]) <= noise.length) {
			res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'content-length': bytes[1] });
			res.end(noise.subarray(0, Number(bytes[1])));
			return;
		}
		if (url.pathname === '/sink' && req.method === 'POST') {
			let received = 0;
			req.on('data', (d) => (received += d.length));
			req.on('end', () => res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }).end(String(received)));
			return;
		}
		if (url.pathname === '/slow.js') {
			setTimeout(() => {
				res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
				res.end(`export const loaded = ${JSON.stringify('x'.repeat(4000))};\n`);
			}, slowScriptMs);
			return;
		}
		if (url.pathname === '/api/settings') {
			if (req.method !== 'POST') {
				res.writeHead(405).end();
				return;
			}
			let body = '';
			req.on('data', (d) => (body += d));
			req.on('end', () => {
				setTimeout(() => {
					let parsed = {};
					try {
						parsed = JSON.parse(body);
					} catch {}
					if (String(parsed.name).trim().toLowerCase() === 'fail') {
						res.writeHead(422, { 'content-type': 'application/json', 'cache-control': 'no-store' });
						res.end(JSON.stringify({ error: 'The server rejected this display name.' }));
						return;
					}
					const total = (Number(parsed.quantity) * Number(parsed.unitPrice)).toFixed(2);
					res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
					res.end(JSON.stringify({ message: `Saved ${parsed.name}, total $${total}` }));
				}, 300);
			});
			return;
		}
		if (['/', '/records', '/settings'].includes(url.pathname.replace(/\/+$/, '') || '/')) {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', link: '</slow.js>; rel=modulepreload' });
			res.end(html);
			return;
		}
		res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
	});
	return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ close: () => new Promise((r) => server.close(r)) })));
}
