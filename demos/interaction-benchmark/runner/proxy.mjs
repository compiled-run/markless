// Identical reverse proxy in front of every locally served entrant, so transport is not a framework variable.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const BROTLI_QUALITY = 5;
const COMPRESSIBLE = /^(text\/|application\/(javascript|x-javascript|json|manifest\+json|xml|ld\+json)|image\/svg\+xml)/i;
const SEGMENT_BYTES = 4096;
const BOTTLENECK_QUEUE_BYTES = 64 * 1024;
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'http2-settings', 'host']);

/**
 * One direction of an emulated link: a FIFO bottleneck draining at rateKbps, then a fixed one-way delay.
 * Every byte of the connection shares the bottleneck, so HTTP/2 streams contend for it like on a real link.
 */
function shapeDirection(src, dst, { rateKbps, delayMs, availableAt }) {
	const msPerByte = rateKbps ? 8 / rateKbps : 0;
	const queueMs = BOTTLENECK_QUEUE_BYTES * msPerByte;
	let linkFreeAt = availableAt;
	const queue = [];
	let timer = null;
	let ended = false;
	let paused = false;
	const flush = () => {
		timer = null;
		const now = performance.now();
		while (queue.length && queue[0].at <= now) dst.write(queue.shift().chunk);
		if (paused && linkFreeAt - now <= queueMs) {
			paused = false;
			src.resume();
		}
		if (queue.length) timer = setTimeout(flush, queue[0].at - now);
		else if (ended) dst.end();
	};
	src.on('data', (data) => {
		const now = performance.now();
		for (let i = 0; i < data.length; i += SEGMENT_BYTES) {
			const chunk = data.subarray(i, i + SEGMENT_BYTES);
			linkFreeAt = Math.max(now, linkFreeAt) + chunk.length * msPerByte;
			queue.push({ chunk, at: linkFreeAt + delayMs });
		}
		if (linkFreeAt - now > queueMs) {
			paused = true;
			src.pause();
		}
		if (!timer) flush();
	});
	src.on('end', () => {
		ended = true;
		if (!timer && !queue.length) dst.end();
	});
}

/**
 * Listener whose accepted TCP connections are relayed to the proxy's own port through an emulated link:
 * RTT split evenly between directions, one RTT of TCP handshake before the client's first byte leaves,
 * and download/upload rate limits applied to the connection's whole byte stream (TLS included).
 */
async function startShapedListener({ port, host, innerPort, network }) {
	const sockets = new Set();
	const rtt = network.latencyMs ?? 0;
	const server = net.createServer({ noDelay: true }, (client) => {
		const acceptedAt = performance.now();
		const inner = net.connect({ port: innerPort, host, noDelay: true });
		const destroy = () => {
			client.destroy();
			inner.destroy();
		};
		for (const s of [client, inner]) {
			sockets.add(s);
			s.on('close', () => sockets.delete(s));
			s.on('error', destroy);
		}
		shapeDirection(client, inner, { rateKbps: network.uploadKbps, delayMs: rtt / 2, availableAt: acceptedAt + rtt });
		shapeDirection(inner, client, { rateKbps: network.downloadKbps, delayMs: rtt / 2, availableAt: acceptedAt });
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, host, resolve);
	});
	return {
		port: server.address().port,
		close: () =>
			new Promise((resolve) => {
				for (const s of sockets) s.destroy();
				server.close(() => resolve());
			}),
	};
}

let cachedCert;
export function selfSignedCert() {
	if (cachedCert !== undefined) return cachedCert;
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-proxy-cert-'));
	const keyFile = path.join(dir, 'key.pem');
	const certFile = path.join(dir, 'cert.pem');
	const base = ['req', '-x509', '-nodes', '-days', '7', '-subj', '/CN=localhost', '-keyout', keyFile, '-out', certFile, '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'];
	// LibreSSL writes explicit EC parameters unless told otherwise; TLS peers reject those.
	const keys = [['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-pkeyopt', 'ec_param_enc:named_curve'], ['-newkey', 'rsa:2048']];
	for (const key of keys) {
		try {
			execFileSync('openssl', [...base, ...key], { stdio: 'ignore' });
			cachedCert = { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
			return cachedCert;
		} catch {}
	}
	cachedCert = null;
	return cachedCert;
}

/**
 * Starts the proxy. HTTP/2 over TLS with a self-signed certificate when openssl is available
 * (browsers must ignore certificate errors), otherwise HTTP/1.1 keep-alive. Responses the upstream
 * sent uncompressed are brotli-compressed (streamed, flushed per chunk); compressed ones pass through.
 * `shaped` adds listeners ({ name, port, network }; port 0 = any free port) serving the same proxy through
 * an emulated network link; their origins are returned in `shapedUrls` by name.
 */
export async function startProxy({ upstream, port, host = '127.0.0.1', preferHttp2 = true, brotliQuality = BROTLI_QUALITY, shaped = [] }) {
	const target = new URL(upstream);
	const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
	const stats = { responses: 0, compressedByProxy: 0, passedThroughEncoded: 0, uncompressedPassThrough: 0, upstreamErrors: 0 };
	const cert = preferHttp2 ? selfSignedCert() : null;
	const scheme = cert ? 'https' : 'http';
	const origin = `${scheme}://${host}:${port}`;

	const handler = (req, res) => {
		const headers = {};
		for (const [key, value] of Object.entries(req.headers)) if (!key.startsWith(':') && !HOP_BY_HOP.has(key)) headers[key] = value;
		const authority = req.headers[':authority'] ?? req.headers.host ?? `${host}:${port}`;
		headers.host = authority;
		headers['x-forwarded-host'] = authority;
		headers['x-forwarded-proto'] = scheme;
		const upstreamReq = http.request(
			{ hostname: target.hostname, port: target.port, method: req.method, path: req.url, headers, agent },
			(upstreamRes) => {
				stats.responses++;
				const out = {};
				for (const [key, value] of Object.entries(upstreamRes.headers)) if (!HOP_BY_HOP.has(key)) out[key] = value;
				if (typeof out.location === 'string' && out.location.startsWith(target.origin)) out.location = `${scheme}://${authority}` + out.location.slice(target.origin.length);
				const status = upstreamRes.statusCode ?? 502;
				const accepts = /\bbr\b/.test(String(req.headers['accept-encoding'] ?? ''));
				const hasBody = req.method !== 'HEAD' && status !== 204 && status !== 304;
				const compress = hasBody && accepts && !out['content-encoding'] && COMPRESSIBLE.test(String(out['content-type'] ?? ''));
				if (out['content-encoding']) stats.passedThroughEncoded++;
				else if (!compress) stats.uncompressedPassThrough++;
				if (!compress) {
					res.writeHead(status, out);
					upstreamRes.pipe(res);
					return;
				}
				stats.compressedByProxy++;
				delete out['content-length'];
				out['content-encoding'] = 'br';
				out.vary = out.vary ? `${out.vary}, Accept-Encoding` : 'Accept-Encoding';
				res.writeHead(status, out);
				const brotli = zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: brotliQuality } });
				brotli.pipe(res);
				upstreamRes.on('data', (chunk) => {
					brotli.write(chunk);
					brotli.flush(zlib.constants.BROTLI_OPERATION_FLUSH);
				});
				upstreamRes.on('end', () => brotli.end());
				upstreamRes.on('error', () => brotli.destroy());
			},
		);
		upstreamReq.on('error', (error) => {
			stats.upstreamErrors++;
			if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
			res.end(`proxy upstream error: ${error.message}`);
		});
		req.pipe(upstreamReq);
	};

	const server = cert ? http2.createSecureServer({ ...cert, allowHTTP1: true }, handler) : http.createServer({ keepAlive: true }, handler);
	const sessions = new Set();
	server.on(cert ? 'session' : 'connection', (s) => {
		sessions.add(s);
		s.on('close', () => sessions.delete(s));
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, host, resolve);
	});
	const shapedListeners = [];
	const shapedUrls = {};
	const shapedNetworks = {};
	try {
		for (const { name, port: shapedPort = 0, network } of shaped) {
			const listener = await startShapedListener({ port: shapedPort, host, innerPort: server.address().port, network });
			shapedListeners.push(listener);
			shapedUrls[name] = `${scheme}://${host}:${listener.port}`;
			shapedNetworks[name] = { rttMs: network.latencyMs ?? 0, downloadKbps: network.downloadKbps ?? null, uploadKbps: network.uploadKbps ?? null };
		}
	} catch (error) {
		for (const l of shapedListeners) await l.close();
		await new Promise((resolve) => server.close(resolve));
		throw error;
	}
	return {
		url: origin,
		shapedUrls,
		shaping: shaped.length ? { model: 'per-connection link: rate-limited FIFO bottleneck (64 KB queue) + RTT/2 each way; +1 RTT TCP handshake before the first client byte', profiles: shapedNetworks } : null,
		protocol: cert ? 'h2 (TLS, self-signed; HTTP/1.1 fallback via ALPN)' : 'http/1.1 keep-alive (openssl unavailable)',
		compression: `brotli q${brotliQuality} for uncompressed text/js/css/html/json/svg; upstream-encoded responses passed through`,
		stats,
		close: () =>
			new Promise((resolve) => {
				for (const s of sessions) s.destroy();
				agent.destroy();
				Promise.all(shapedListeners.map((l) => l.close())).then(() => server.close(() => resolve()));
			}),
	};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	const arg = (name) => {
		const i = process.argv.indexOf(name);
		return i > 0 ? process.argv[i + 1] : undefined;
	};
	const upstream = arg('--upstream');
	const port = Number(arg('--port'));
	if (!upstream || !port) {
		console.error('usage: node runner/proxy.mjs --upstream http://127.0.0.1:4410 --port 5410 [--http1]');
		process.exit(2);
	}
	const proxy = await startProxy({ upstream, port, preferHttp2: !process.argv.includes('--http1') });
	console.log(`proxy ${proxy.url} -> ${upstream} (${proxy.protocol}; ${proxy.compression})`);
}
