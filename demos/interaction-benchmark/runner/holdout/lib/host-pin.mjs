// Loopback forwarder between the runner proxy and an app server that restores the app's own Host and drops
// X-Forwarded-*: SSR code that fetches its own origin from the request URL (live-feed-ssr) would otherwise
// call the proxy's TLS port over plain HTTP and render its error arm.
import http from 'node:http';
import { freePort } from './app-server.mjs';

export async function startHostPin(upstream) {
	const target = new URL(upstream);
	const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
	const server = http.createServer((req, res) => {
		const headers = { ...req.headers, host: target.host };
		for (const name of Object.keys(headers))
			if (name.startsWith('x-forwarded-')) delete headers[name];
		// The proxy compresses every response; a preview server asked for br recompresses each request far slower.
		headers['accept-encoding'] = 'identity';
		const out = http.request(
			{
				hostname: target.hostname,
				port: target.port,
				method: req.method,
				path: req.url,
				headers,
				agent,
			},
			(up) => {
				res.writeHead(up.statusCode ?? 502, up.headers);
				up.pipe(res);
			},
		);
		out.on('error', (error) => {
			if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
			res.end(`host-pin upstream error: ${error.message}`);
		});
		req.pipe(out);
	});
	const port = await freePort();
	await new Promise((r) => server.listen(port, '127.0.0.1', r));
	return {
		origin: `http://127.0.0.1:${port}`,
		close: () =>
			new Promise((r) => {
				agent.destroy();
				server.closeAllConnections?.();
				server.close(() => r());
			}),
	};
}
