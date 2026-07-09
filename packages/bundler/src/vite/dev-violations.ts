import { parsePath } from 'ufo';

type MiddlewareRequest = {
	readonly method?: string;
	readonly url?: string;
	setEncoding?: (encoding: BufferEncoding) => void;
	on?: (event: 'data' | 'end' | 'error', handler: (chunk?: unknown) => void) => unknown;
};
type MiddlewareResponse = { statusCode: number; setHeader: SetHeader; end: (body?: string) => void };
type SetHeader = (name: string, value: string) => void;
type Next = () => void;

const VIOLATIONS_PATH = '/__markless/violations';

export function createDevViolationsMiddleware() {
	const lines: string[] = [];
	const middleware = (req: MiddlewareRequest, res: MiddlewareResponse, next: Next) => {
		if (parsePath(req.url ?? '').pathname !== VIOLATIONS_PATH) return next();
		if (req.method === 'GET') {
			res.statusCode = 200;
			res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
			res.end(lines.join(''));
			return;
		}
		if (req.method === 'POST') return readViolation(req, res, (event) => lines.push(event));
		res.statusCode = 405;
		res.setHeader('allow', 'GET, POST');
		res.end('Method Not Allowed');
	};
	return { middleware, events: lines };
}

function readViolation(req: MiddlewareRequest, res: MiddlewareResponse, append: (line: string) => void) {
	let body = '';
	req.setEncoding?.('utf8');
	req.on?.('data', (chunk) => (body += String(chunk ?? '')));
	req.on?.('end', () => {
		const event = parseViolationEvent(body);
		if (!event) {
			res.statusCode = 400;
			res.end('Invalid Markless violation event');
			return;
		}
		append(`${JSON.stringify(event)}\n`);
		res.statusCode = 204;
		res.end();
	});
	req.on?.('error', () => {
		res.statusCode = 400;
		res.end('Invalid Markless violation event');
	});
}

export function parseViolationEvent(body: string): Record<string, unknown> | null {
	try {
		const input = JSON.parse(body) as Record<string, unknown>;
		if (typeof input.code !== 'string' || typeof input.message !== 'string') return null;
		return definedFields({
			ts: typeof input.ts === 'number' ? input.ts : Date.now(),
			code: input.code,
			message: input.message,
			regionKind: stringField(input.regionKind),
			regionName: stringField(input.regionName),
			hostNodeId: stringField(input.hostNodeId),
			eventName: stringField(input.eventName),
			cause: input.cause,
		});
	} catch {
		return null;
	}
}

function stringField(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function definedFields<T extends Record<string, unknown>>(value: T): T {
	for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
	return value;
}
