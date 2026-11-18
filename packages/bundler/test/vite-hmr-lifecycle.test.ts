import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	MARKLESS_DEV_ERROR_CLEAR_EVENT,
	MARKLESS_DEV_ERROR_EVENT,
} from '../src/dev-error/index.ts';
import { createViteHmr } from '../src/vite/hmr.ts';

const valid = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
`;
const other = valid.replace('{count}', '{count + 1}');
const broken = valid.replace('</button>', '</button>>');

const ERROR = 'error';
const CLEAR = 'clear';
const RELOAD = 'full-reload';

function sent(send: ReturnType<typeof vi.fn>) {
	return send.mock.calls.map(([message]) => {
		if (message.type !== 'custom') return message.type as string;
		if (message.event === MARKLESS_DEV_ERROR_EVENT) return ERROR;
		if (message.event === MARKLESS_DEV_ERROR_CLEAR_EVENT) return CLEAR;
		return message.event as string;
	});
}

function devServer(
	filename: string,
	options: { recheckMs?: number; loadedNowhere?: boolean; configure?: boolean } = {},
) {
	const send = vi.fn();
	const moduleGraph = {
		getModuleById: vi.fn(),
		invalidateModule: vi.fn(),
		...(options.loadedNowhere ? { getModulesByFile: () => new Set() } : {}),
	};
	const client = { config: { consumer: 'client' }, hot: { send }, moduleGraph };
	const ssr = { config: { consumer: 'server' }, moduleGraph };
	const httpServer = new EventEmitter();
	const watcher = new EventEmitter();
	const hmr = createViteHmr({
		base: '/',
		clientEnvironment: 'client',
		enabled: true,
		...(options.recheckMs === undefined ? {} : { invalidSourceRecheckMs: options.recheckMs }),
	});
	const configure = () =>
		hmr.configureServer({
			config: { root: '/' },
			environments: { client, ssr },
			httpServer,
			watcher,
		} as never);
	if (options.configure !== false) configure();

	let timestamp = 0;
	// One save is one client pass and one SSR pass sharing a timestamp, as Vite runs them.
	async function save(source: string) {
		send.mockClear();
		const update = {
			file: filename,
			modules: [],
			read: async () => source,
			timestamp: ++timestamp,
			type: 'update',
		} as never;
		await hmr.hotUpdate(client as never, update);
		await hmr.hotUpdate(ssr as never, update);
		return sent(send);
	}
	const report = (id: string) =>
		hmr.reportError(client as never, {
			payload: { version: 1, id, kind: 'compile', diagnostics: [], details: 'broken' },
		});

	return { hmr, send, client, httpServer, watcher, configure, save, report };
}

const missingFile = '/markless-hmr-lifecycle/src/App.tsrx';

describe('HMR invalid-source recovery (characterisation)', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	describe('saves', () => {
		// The recheck poller never runs here: only intervals are faked and no test advances them.
		const fakeIntervals = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

		test('valid saves B, A, B reload once per save', async () => {
			fakeIntervals();
			const { save } = devServer(missingFile);
			expect(await save(valid)).toEqual([RELOAD]);
			expect(await save(other)).toEqual([RELOAD]);
			expect(await save(valid)).toEqual([RELOAD]);
		});

		test('B, broken, B, broken reports, then clears and reloads, then reports again', async () => {
			fakeIntervals();
			const { save } = devServer(missingFile);
			expect(await save(valid)).toEqual([RELOAD]);
			expect(await save(broken)).toEqual([ERROR]);
			expect(await save(valid)).toEqual([CLEAR, RELOAD]);
			expect(await save(broken)).toEqual([ERROR]);
		});

		test('the same valid bytes saved twice send nothing the second time', async () => {
			fakeIntervals();
			const { save } = devServer(missingFile);
			expect(await save(valid)).toEqual([RELOAD]);
			expect(await save(valid)).toEqual([]);
		});

		test('the same broken bytes saved twice report the error once', async () => {
			fakeIntervals();
			const { save } = devServer(missingFile);
			expect(await save(broken)).toEqual([ERROR]);
			expect(await save(broken)).toEqual([]);
		});

		test('a broken save arms the recheck poller and the valid save that fixes it stops it', async () => {
			fakeIntervals();
			const { save } = devServer(missingFile);
			expect(await save(broken)).toEqual([ERROR]);
			expect(vi.getTimerCount()).toBe(1);
			expect(await save(valid)).toEqual([CLEAR, RELOAD]);
			expect(vi.getTimerCount()).toBe(0);
		});

		test('a reported error on a file whose bytes were already handled keeps the next identical save silent', async () => {
			fakeIntervals();
			const { save, report, send } = devServer(missingFile);
			expect(await save(valid)).toEqual([RELOAD]);
			send.mockClear();
			report(missingFile);
			expect(sent(send)).toEqual([ERROR]);
			expect(await save(valid)).toEqual([]);
			expect(await save(other)).toEqual([CLEAR, RELOAD]);
		});

		test('a file no environment loads is still reloaded while it is invalid', async () => {
			fakeIntervals();
			const { save, report } = devServer(missingFile, { loadedNowhere: true });
			expect(await save(valid)).toEqual([]);
			report(missingFile);
			expect(await save(other)).toEqual([CLEAR, RELOAD]);
			expect(await save(valid)).toEqual([]);
		});

		test('errors with ids that are not .tsrx files are reported but never polled', async () => {
			fakeIntervals();
			const { report, send } = devServer(missingFile);
			report('navigation:unknown');
			report('/markless-hmr-lifecycle/src/data.ts');
			expect(sent(send)).toEqual([ERROR, ERROR]);
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe('recheck poller', () => {
		async function fixture(name: string) {
			const root = await mkdtemp(join(tmpdir(), `markless-hmr-lifecycle-${name}-`));
			return { root, filename: join(root, 'App.tsrx') };
		}

		test('recovers a broken file fixed on disk without a save: clear, then one reload, then the poller stops', async () => {
			const { root, filename } = await fixture('recover');
			const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
			const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
			try {
				await writeFile(filename, broken);
				const { save, send } = devServer(filename, { recheckMs: 10 });
				expect(await save(broken)).toEqual([ERROR]);
				const poller = setIntervalSpy.mock.results.find(
					(_result, index) => setIntervalSpy.mock.calls[index]![1] === 10,
				)?.value;
				expect(poller).toBeDefined();

				send.mockClear();
				const reloaded = new Promise<void>((resolve) =>
					send.mockImplementation((message: { type?: string }) => {
						if (message.type === RELOAD) resolve();
					}),
				);
				await writeFile(filename, valid);
				await reloaded;
				expect(send.mock.calls).toEqual([
					[
						{
							type: 'custom',
							event: MARKLESS_DEV_ERROR_CLEAR_EVENT,
							data: { id: filename },
						},
					],
					[{ type: RELOAD }],
				]);
				expect(
					clearIntervalSpy.mock.calls.filter(([handle]) => handle === poller),
				).toHaveLength(1);

				// The handled broken bytes stay remembered after the poller recovers the file.
				expect(await save(broken)).toEqual([]);
				expect(await save(valid)).toEqual([RELOAD]);
			} finally {
				setIntervalSpy.mockRestore();
				clearIntervalSpy.mockRestore();
				await rm(root, { force: true, recursive: true });
			}
		});

		test('a deleted invalid file is cleared without a reload and the poller stops', async () => {
			const { root, filename } = await fixture('deleted');
			const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
			const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
			try {
				await writeFile(filename, broken);
				const { report, send } = devServer(filename, { recheckMs: 10 });
				report(filename);
				const poller = setIntervalSpy.mock.results.find(
					(_result, index) => setIntervalSpy.mock.calls[index]![1] === 10,
				)?.value;
				expect(poller).toBeDefined();
				send.mockClear();
				const cleared = new Promise<void>((resolve) =>
					send.mockImplementation(() => resolve()),
				);
				await rm(filename);
				await cleared;
				await vi.waitFor(() =>
					expect(
						clearIntervalSpy.mock.calls.filter(([handle]) => handle === poller),
					).toHaveLength(1),
				);
				expect(send.mock.calls).toEqual([
					[
						{
							type: 'custom',
							event: MARKLESS_DEV_ERROR_CLEAR_EVENT,
							data: { id: filename },
						},
					],
				]);
			} finally {
				setIntervalSpy.mockRestore();
				clearIntervalSpy.mockRestore();
				await rm(root, { force: true, recursive: true });
			}
		});
	});

	describe('server lifecycle', () => {
		test('closing the http server stops the poller and forgets invalid files without sending', async () => {
			vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
			const { save, report, send, httpServer } = devServer(missingFile, { recheckMs: 10 });
			report(missingFile);
			expect(vi.getTimerCount()).toBe(1);
			send.mockClear();
			httpServer.emit('close');
			expect(vi.getTimerCount()).toBe(0);
			expect(send).not.toHaveBeenCalled();
			expect(await save(valid)).toEqual([RELOAD]);
		});

		test('closing the watcher stops the poller too', async () => {
			vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
			const { report, watcher } = devServer(missingFile, { recheckMs: 10 });
			report(missingFile);
			expect(vi.getTimerCount()).toBe(1);
			watcher.emit('close');
			expect(vi.getTimerCount()).toBe(0);
		});

		test('a closed server still reports and polls a file that breaks afterwards', async () => {
			vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
			const { save, httpServer } = devServer(missingFile, { recheckMs: 10 });
			httpServer.emit('close');
			expect(await save(broken)).toEqual([ERROR]);
			expect(vi.getTimerCount()).toBe(1);
		});

		test('an error reported before configureServer without an environment is dropped', () => {
			vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
			const { hmr, send } = devServer(missingFile, { configure: false });
			hmr.reportError(undefined, {
				payload: {
					version: 1,
					id: missingFile,
					kind: 'compile',
					diagnostics: [],
					details: 'broken',
				},
			});
			expect(send).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		test('an error reported before configureServer on the client environment is sent and polled, and its recovery sends nothing', async () => {
			const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
			const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
			try {
				const { report, send } = devServer(missingFile, {
					configure: false,
					recheckMs: 10,
				});
				report(missingFile);
				expect(sent(send)).toEqual([ERROR]);
				const poller = setIntervalSpy.mock.results.find(
					(_result, index) => setIntervalSpy.mock.calls[index]![1] === 10,
				)?.value;
				expect(poller).toBeDefined();
				// The file does not exist, so the first recheck drops it; with no server there is no channel to clear on.
				await vi.waitFor(() =>
					expect(
						clearIntervalSpy.mock.calls.filter(([handle]) => handle === poller),
					).toHaveLength(1),
				);
				expect(sent(send)).toEqual([ERROR]);
			} finally {
				setIntervalSpy.mockRestore();
				clearIntervalSpy.mockRestore();
			}
		});
	});
});
