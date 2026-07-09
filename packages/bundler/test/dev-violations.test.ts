import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import { createRegionRenderError } from '../../web/src/runtime-error-reporting.ts';
import { marklessDevViolationFromError } from '../../web/src/dev-log.ts';
import { createDevViolationsMiddleware } from '../src/vite/dev-violations.ts';

test('dev violation middleware buffers JSONL events with enriched runtime fields', () => {
	const { middleware } = createDevViolationsMiddleware();
	const cause = Object.assign(new Error('empty arm'), { code: 'MARKLESS_BRANCH_ARM_EMPTY' });
	const event = marklessDevViolationFromError(
		Object.assign(
			createRegionRenderError({
				regionKind: 'branch',
				regionName: 'ready',
				originalError: cause,
			}),
			{ hostNodeId: 'h1', eventName: 'click' },
		),
	);
	const post = req('POST', '/__markless/violations');
	const posted = res();
	middleware(post, posted, vi.fn());
	post.emit('data', JSON.stringify(event));
	post.emit('end');
	expect(posted.statusCode).toBe(204);

	const get = req('GET', '/__markless/violations');
	const got = res();
	middleware(get, got, vi.fn());
	expect(got.headers['content-type']).toBe('application/x-ndjson; charset=utf-8');
	expect(JSON.parse(got.body!.trim())).toMatchObject({
		code: 'MARKLESS_REGION_RENDER_ERROR',
		message: 'MARKLESS_REGION_RENDER_ERROR: branch "ready" failed while rendering: empty arm',
		regionKind: 'branch',
		regionName: 'ready',
		hostNodeId: 'h1',
		eventName: 'click',
		cause: { name: 'Error', message: 'empty arm', code: 'MARKLESS_BRANCH_ARM_EMPTY' },
	});
});

function req(method: string, url: string) {
	return Object.assign(new EventEmitter(), { method, url, setEncoding: vi.fn() });
}

function res() {
	return {
		statusCode: 0,
		headers: {} as Record<string, string>,
		body: undefined as string | undefined,
		setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; },
		end(body?: string) { this.body = body; },
	};
}
