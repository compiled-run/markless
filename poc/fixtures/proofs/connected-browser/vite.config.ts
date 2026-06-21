import { defineConfig } from 'vite';
import { writeFileSync } from 'node:fs';

const receiptPath = '/private/tmp/async-connected-browser-receipts.json';

export default defineConfig({
	plugins: [
		{
			name: 'async-connected-browser-receipts',
			configureServer(server) {
				server.middlewares.use(
					'/__async_connected_browser_receipts',
					(request, response) => {
						if (request.method !== 'POST') {
							response.statusCode = 405;
							response.end('method not allowed');
							return;
						}

						let body = '';
						request.setEncoding('utf8');
						request.on('data', (chunk) => {
							body += chunk;
						});
						request.on('end', () => {
							writeFileSync(receiptPath, body);
							response.setHeader('content-type', 'application/json');
							response.end(JSON.stringify({ ok: true, receiptPath }));
						});
					},
				);
			},
		},
	],
});
