import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// The arriving page is parsed into a document with no window; its media, images and frames must still load once swapped in.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let origin = '';
let close: (() => Promise<void>) | undefined;

beforeAll(async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-fragment-media-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/fragment-media-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	await buildFixture({
		root,
	});
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	origin = server.origin;
	close = async () => {
		server.close();
		await rm(root, { recursive: true, force: true });
	};
}, 240_000);

afterAll(async () => {
	await close?.();
});

type Loaded = {
	readonly media: Record<string, { readyState: number; error: number | null; played: string }>;
	readonly images: Record<string, number>;
	readonly frame: string | null;
	readonly sources: readonly string[];
};

const loaded = async (page: Page): Promise<Loaded> => {
	await page.waitForFunction(() =>
		[...document.querySelectorAll<HTMLMediaElement>('[data-media]')].every(
			(media) => media.readyState >= 1 || media.error,
		),
	);
	return page.evaluate(async () => {
		const media: Loaded['media'] = {};
		for (const element of document.querySelectorAll<HTMLMediaElement>('[data-media]'))
			media[element.dataset.media!] = {
				readyState: element.readyState,
				error: element.error?.code ?? null,
				played: await element.play().then(
					() => 'played',
					(error: Error) => error.name,
				),
			};
		await Promise.all(
			[...document.querySelectorAll<HTMLImageElement>('[data-image]')].map((image) =>
				image.decode().catch(() => undefined),
			),
		);
		const images: Loaded['images'] = {};
		for (const image of document.querySelectorAll<HTMLImageElement>('[data-image]'))
			images[image.dataset.image!] = image.naturalWidth;
		const frame = document.querySelector<HTMLIFrameElement>('[data-frame-host]')!;
		if (frame.contentDocument?.readyState !== 'complete')
			await new Promise((done) => frame.addEventListener('load', done, { once: true }));
		const sources = [
			...document.querySelectorAll<HTMLMediaElement | HTMLImageElement>(
				'[data-media], [data-image]',
			),
		].map((element) => new URL(element.currentSrc).search);
		return {
			media,
			images,
			frame: frame.contentDocument?.querySelector('[data-frame]')?.textContent ?? null,
			sources: [...sources, frame.contentWindow!.location.search],
		};
	});
};

const playing = { readyState: expect.any(Number), error: null, played: 'played' };
const expected = {
	media: {
		'video-src': playing,
		'video-source': playing,
		'audio-src': playing,
		'video-nested': playing,
	},
	images: { src: 2, srcset: 2, picture: 2 },
	frame: 'framed',
	sources: expect.any(Array),
};

for (const [name, browserType] of [
	['chromium', chromium],
	['webkit', webkit],
] as ReadonlyArray<readonly [string, BrowserType]>) {
	describe(`media on a page swapped in place (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await launchBrowser(browserType);
		});
		afterAll(async () => {
			await browser?.close();
		});

		const open = async (path: string) => {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			await page.goto(origin + path, { waitUntil: 'load' });
			return { page, errors };
		};

		test('a full load of the page plays its media and shows its images', async () => {
			const { page, errors } = await open('/media');
			const result = await loaded(page);
			expect(result).toEqual(expected);
			for (const media of Object.values(result.media))
				expect(media.readyState).toBeGreaterThan(0);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('the same page arriving in place plays its media and shows its images', async () => {
			const { page, errors } = await open('/');
			const documents: string[] = [];
			page.on('request', (request) => {
				if (request.resourceType() === 'document')
					documents.push(new URL(request.url()).pathname);
			});
			await page.locator('[data-go="media"]').click();
			await page.waitForFunction(() => document.querySelector('[data-page="media"]'));
			const result = await loaded(page);
			expect(result).toEqual(expected);
			for (const media of Object.values(result.media))
				expect(media.readyState).toBeGreaterThan(0);
			expect(documents.filter((path) => path !== '/frame.html')).toEqual([]);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a page arriving in place over one of the same shape plays and shows its own sources', async () => {
			const { page, errors } = await open('/media');
			await loaded(page);
			await page.locator('[data-go="clip"]').click();
			await page.waitForFunction(() => document.querySelector('[data-page="clip"]'));
			const result = await loaded(page);
			expect(result).toEqual(expected);
			expect(result.sources.filter((search) => !search.includes('clip'))).toEqual([]);
			expect(result.sources).toHaveLength(8);
			expect(errors).toEqual([]);
			await page.close();
		});
	});
}
