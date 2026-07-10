import { defineConfig, type Plugin } from 'vite';
import { markless } from '@markless/bundler/vite';

type PreviewRequest = {
	readonly url?: string;
	readonly method?: string;
	readonly headers: Record<string, string | string[] | undefined>;
};

type PreviewResponse = {
	statusCode: number;
	setHeader(name: string, value: string): void;
	end(body?: string): void;
};

const REQUEST_LOG_PATH = '/__markless-fixture-requests';

export default defineConfig(({ mode }) => ({
	plugins: [markless({ debug: mode === 'debug-channel' }), fixtureScriptRequestLog()],
}));

function fixtureScriptRequestLog(): Plugin {
	return {
		name: 'fixture:csr-script-request-log',
		configurePreviewServer(server) {
			const scripts: string[] = [];
			server.middlewares.use((incomingRequest, outgoingResponse, next) => {
				const request = incomingRequest as PreviewRequest;
				if (!request.url || request.method !== 'GET') {
					next();
					return;
				}

				const pathname = new URL(request.url, requestOrigin(request)).pathname;
				if (pathname === REQUEST_LOG_PATH) {
					const response = outgoingResponse as PreviewResponse;
					response.statusCode = 200;
					response.setHeader('Content-Type', 'application/json;charset=utf-8');
					response.end(JSON.stringify({ scripts }));
					return;
				}
				if (isScriptRequest(request, pathname)) {
					scripts.push(pathname);
				}
				next();
			});
		},
	};
}

function isScriptRequest(request: PreviewRequest, pathname: string): boolean {
	const destination = request.headers['sec-fetch-dest'];
	return destination === 'script' || pathname.endsWith('.js') || pathname.endsWith('.mjs');
}

function requestOrigin(request: PreviewRequest): string {
	const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
	return `http://${host}`;
}
