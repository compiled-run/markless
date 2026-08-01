import type { Plugin } from 'vite';

type MiddlewareServer = {
	readonly middlewares: {
		use(handler: Middleware): void;
	};
};

type Middleware = (
	request: {
		readonly method?: string;
		readonly url?: string;
		readonly headers: { readonly host?: string | readonly string[] };
	},
	response: {
		statusCode: number;
		setHeader(name: string, value: string): void;
		end(body?: string): void;
	},
	next: () => void,
) => void;

const UPDATE_PATH = '/api/updates';
const DEFAULT_LATENCY_MS = 250;
const MAX_LATENCY_MS = 3_000;

const updates = [
	{ id: 'atlas-204', project: 'Atlas compiler', version: '2.0.4', stage: 'stable' },
	{ id: 'beacon-118', project: 'Beacon runtime', version: '1.1.8', stage: 'preview' },
	{ id: 'cinder-73', project: 'Cinder tools', version: '0.7.3', stage: 'stable' },
];

// Mirrored from ../live-feed/local-update-endpoint.ts. Keeping the host
// adapter demo-local gives both preview servers the same deterministic API.
export function localUpdateEndpoint(): Plugin {
	return {
		name: 'live-feed-ssr:local-update-endpoint',
		configureServer(server) {
			installMiddleware(server as unknown as MiddlewareServer);
		},
		configurePreviewServer(server) {
			installMiddleware(server as unknown as MiddlewareServer);
		},
	};
}

function installMiddleware(server: MiddlewareServer): void {
	server.middlewares.use((request, response, next) => {
		if (request.method !== 'GET' || !request.url) {
			next();
			return;
		}

		const url = new URL(request.url, requestOrigin(request.headers.host));
		if (url.pathname !== UPDATE_PATH) {
			next();
			return;
		}

		const latencyMs = controlledLatency(url.searchParams.get('latency'));
		const shouldFail = url.searchParams.get('fail') === '1';
		setTimeout(() => {
			response.statusCode = shouldFail ? 503 : 200;
			response.setHeader('Cache-Control', 'no-store');
			response.setHeader('Content-Type', 'application/json; charset=utf-8');
			response.end(
				JSON.stringify(
					shouldFail
						? { error: 'forced-local-failure' }
						: { channel: 'Local build updates', updates },
				),
			);
		}, latencyMs);
	});
}

function controlledLatency(value: string | null): number {
	if (value === null) return DEFAULT_LATENCY_MS;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return DEFAULT_LATENCY_MS;
	return Math.min(MAX_LATENCY_MS, Math.max(0, Math.floor(parsed)));
}

function requestOrigin(host: string | readonly string[] | undefined): string {
	return `http://${typeof host === 'string' ? host : 'localhost'}`;
}
