import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { ECHO_SERVER_PORT } from '../../proofs/ladder.ts';

/** The processes with a TCP socket on a local port, listening or connected, as `lsof` or `ss` names them. */
function portHolder(port: number): string {
	const probes: Array<[string, string[]]> = [
		['lsof', ['-nP', `-iTCP:${port}`]],
		['ss', ['-Htanp', `sport = :${port}`]],
	];
	for (const [command, args] of probes) {
		try {
			const found = execFileSync(command, args, {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			}).trim();
			if (found) return found;
		} catch {}
	}
	return 'a process neither lsof nor ss could name';
}

/** One request the echo server answered, as the test reads it back. */
export type EchoRequest = {
	readonly method: string;
	readonly url: string;
	readonly contentType: string | null;
	readonly body: string;
};

/** What the server answers a request with: the request, read back. */
export const echoText = (request: EchoRequest): string =>
	`${request.method} ${request.url} ${request.contentType ?? '-'} ${request.body}`;

/**
 * The test's server for rungs that fetch: it answers every request with `<method> <path and query> <content type> <body>`
 * as text, readable from any origin, and keeps each request so a test can name what the app sent.
 */
export async function startEchoServer(port = ECHO_SERVER_PORT): Promise<{
	readonly requests: ReadonlyArray<EchoRequest>;
	readonly close: () => Promise<void>;
}> {
	const requests: EchoRequest[] = [];
	const server = createServer((request, response) => {
		const chunks: Buffer[] = [];
		request.on('data', (chunk: Buffer) => chunks.push(chunk));
		request.on('end', () => {
			const body = Buffer.concat(chunks).toString('utf8');
			const contentType = request.headers['content-type'] ?? null;
			const seen: EchoRequest = {
				method: request.method ?? 'GET',
				url: request.url ?? '/',
				contentType,
				body,
			};
			requests.push(seen);
			response.writeHead(200, {
				'content-type': 'text/plain; charset=utf-8',
				'access-control-allow-origin': '*',
				'access-control-allow-headers': '*',
				'access-control-allow-methods': '*',
			});
			response.end(request.method === 'OPTIONS' ? '' : echoText(seen));
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', (error: NodeJS.ErrnoException) =>
			reject(
				error.code === 'EADDRINUSE'
					? new Error(
							`the echo server cannot listen on 127.0.0.1:${port}: it is in use by ${portHolder(port)}`,
							{ cause: error },
						)
					: error,
			),
		);
		server.listen(port, '127.0.0.1', () => resolve());
	});
	return {
		requests,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}
