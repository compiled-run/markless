// Delaying reverse proxy for the throttled-dashboard oracle (T116 gate 2).
//
// Sits on the port the markless-dashboard app forwards /api/** to (4620 —
// both the vite preview proxy and the app's SSR-side default DSM_API_ORIGIN)
// and forwards every request to the real github-manager backend on another
// port, injecting latency into matching paths (default /api/view). This makes
// the dashboard's data plane genuinely slow WITHOUT touching DSM source, so
// the server first-flush deadline (streams), the client navigation deadline
// (hold -> pending) and the pending minimum duration all actually engage
// while the immutable e2e suites run.
//
// Standalone: node scripts/test-utils/dsm-latency-proxy.ts
//   env: DSM_PROXY_LISTEN_PORT (4620), DSM_PROXY_UPSTREAM (http://127.0.0.1:4720),
//        DSM_PROXY_DELAY_MS (300), DSM_PROXY_DELAY_PREFIXES (/api/view)
// Embedded: scripts/test-utils/throttled-dashboard.ts (the repeatable runner).
//
// GET /__latency-proxy/stats returns { total, delayed } — the engagement
// receipt that throttled requests really flowed through the loop.
import http from 'node:http';
import process from 'node:process';

export interface LatencyProxyOptions {
	readonly listenPort: number;
	readonly upstreamOrigin: string;
	readonly delayMs: number;
	readonly delayPathPrefixes: readonly string[];
}

export interface LatencyProxyStats {
	total: number;
	delayed: number;
}

export interface LatencyProxyHandle {
	readonly stats: () => LatencyProxyStats;
	readonly close: () => Promise<void>;
}

export async function startLatencyProxy(options: LatencyProxyOptions): Promise<LatencyProxyHandle> {
	const stats: LatencyProxyStats = { total: 0, delayed: 0 };

	const server = http.createServer((request, response) => {
		void (async () => {
			const path = request.url ?? '/';
			if (path === '/__latency-proxy/stats') {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify(stats));
				return;
			}
			stats.total++;
			const bodyChunks: Buffer[] = [];
			for await (const chunk of request) bodyChunks.push(chunk as Buffer);
			if (options.delayPathPrefixes.some((prefix) => path.startsWith(prefix))) {
				stats.delayed++;
				await new Promise((resolve) => setTimeout(resolve, options.delayMs));
			}
			const upstream = await fetch(`${options.upstreamOrigin}${path}`, {
				method: request.method,
				headers: {
					'content-type': request.headers['content-type'] ?? 'application/json',
				},
				body:
					request.method === 'GET' || request.method === 'HEAD'
						? undefined
						: Buffer.concat(bodyChunks),
			});
			response.writeHead(upstream.status, {
				'content-type': upstream.headers.get('content-type') ?? 'application/json',
			});
			response.end(Buffer.from(await upstream.arrayBuffer()));
		})().catch((error) => {
			response.writeHead(502, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ proxyError: String(error) }));
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(options.listenPort, '127.0.0.1', resolve);
	});

	return {
		stats: () => ({ ...stats }),
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.closeAllConnections();
				server.close((error) => (error ? reject(error) : resolve()));
			}),
	};
}

const isMain = process.argv[1]?.endsWith('dsm-latency-proxy.ts') === true;
if (isMain) {
	const handle = await startLatencyProxy({
		listenPort: Number(process.env.DSM_PROXY_LISTEN_PORT ?? '4620'),
		upstreamOrigin: process.env.DSM_PROXY_UPSTREAM ?? 'http://127.0.0.1:4720',
		delayMs: Number(process.env.DSM_PROXY_DELAY_MS ?? '300'),
		delayPathPrefixes: (process.env.DSM_PROXY_DELAY_PREFIXES ?? '/api/view').split(','),
	});
	console.log('dsm-latency-proxy listening; stats at /__latency-proxy/stats');
	const stop = () => void handle.close().then(() => process.exit(0));
	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
}
