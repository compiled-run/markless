import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root: string;
let browser: Browser;
let app: BuiltServer;

// Two components in two files that neither import each other nor share a parent's props, both on the key 'room'.
const files: Record<string, string> = {
	'lib/loud.ts': `export function loud(light: string) {
	return light.toUpperCase();
}
`,
	'lib/Lamp.tsrx': `import { state, storage } from '@markless/core';
import { loud } from './loud.ts';

export default function Lamp() @{
	let light = storage('room', 'off');
	let taps = state(0);

	<div>
		<button onClick={() => (light = light === 'on' ? 'off' : 'on')}>Flip lamp</button>
		<button onClick={() => taps++}>Wake lamp</button>
		<p data-lamp>{light}</p>
		<p data-lamp-loud>{loud(light)}</p>
		<p data-lamp-taps>{taps}</p>
	</div>
}
`,
	'lib/Window.tsrx': `import { computed, state, storage } from '@markless/core';
import { loud } from './loud.ts';

export default function Window() @{
	let glow = storage('room', 'off');
	let taps = state(0);
	const lit = computed(() => (glow === 'on' ? 'lit' : 'dark'));

	<div>
		<button onClick={() => (glow = glow === 'on' ? 'off' : 'on')}>Flip window</button>
		<button onClick={() => taps++}>Wake window</button>
		<p data-window>{glow}</p>
		<p data-window-loud>{loud(glow)}</p>
		<p data-window-lit>{lit}</p>
		<p data-window-taps>{taps}</p>
	</div>
}
`,
	'pages/both.tsrx': `import Lamp from '../lib/Lamp.tsrx';
import Window from '../lib/Window.tsrx';

export default function Both() @{
	<main>
		<Lamp />
		<Window />
	</main>
}
`,
	'pages/later.tsrx': `import { state } from '@markless/core';
import Lamp from '../lib/Lamp.tsrx';
import Window from '../lib/Window.tsrx';

export default function Later() @{
	let open = state(false);

	<main>
		<Lamp />
		<button onClick={() => (open = !open)}>Show window</button>
		@if (open) {
			<Window />
		}
	</main>
}
`,
	'pages/notes.mdx': `import Lamp from '../lib/Lamp.tsrx';
import Window from '../lib/Window.tsrx';

<Lamp />

# Notes

<Window />
`,
};

beforeAll(async () => {
	browser = await launchBrowser(chromium, { args: ['--mute-audio'] });
	root = await mkdtemp(join(tmpdir(), 'markless-storage-siblings-'));
	const all: Record<string, string> = {
		'package.json': '{ "type": "module" }\n',
		'vite.config.ts': `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';

export default { plugins: [markless(), router()] };
`,
		...files,
	};
	for (const [path, source] of Object.entries(all)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), source);
	}
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		join(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	const nodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		await buildFixture({ root, configFile: join(root, 'vite.config.ts') });
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	app = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
}, 240_000);

afterAll(async () => {
	await app?.close();
	await browser?.close();
	if (root) await rm(root, { recursive: true, force: true });
}, 60_000);

async function visit(path: string, run: (page: Page) => Promise<void>) {
	const context = await browser.newContext({ baseURL: app.origin });
	await context.addInitScript(() => {
		const Audio = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (Audio) Audio.prototype.resume = () => Promise.resolve();
	});
	try {
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await page.waitForLoadState('networkidle');
		await run(page);
		expect(errors).toEqual([]);
	} finally {
		await context.close();
	}
}

const text = (page: Page, selector: string) => () => page.locator(selector).textContent();

async function expectRoom(page: Page, light: 'on' | 'off') {
	await expect.poll(text(page, '[data-lamp]')).toBe(light);
	await expect.poll(text(page, '[data-lamp-loud]')).toBe(light.toUpperCase());
	await expect.poll(text(page, '[data-window]')).toBe(light);
	await expect.poll(text(page, '[data-window-loud]')).toBe(light.toUpperCase());
	await expect.poll(text(page, '[data-window-lit]')).toBe(light === 'on' ? 'lit' : 'dark');
}

const click = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();

for (const path of ['/both', '/notes']) {
	describe(`two components in two files with one storage() key on ${path}`, () => {
		test('a write in the first shows in the second, then a write in the second shows in the first', async () => {
			await visit(path, async (page) => {
				await click(page, 'Flip lamp');
				await expectRoom(page, 'on');
				await click(page, 'Flip window');
				await expectRoom(page, 'off');
				await click(page, 'Flip lamp');
				await expectRoom(page, 'on');
			});
		});

		test('a write in the second shows in the first, then a write in the first shows in the second', async () => {
			await visit(path, async (page) => {
				await click(page, 'Flip window');
				await expectRoom(page, 'on');
				await click(page, 'Flip lamp');
				await expectRoom(page, 'off');
			});
		});

		test('a write in one shows in the other when the other woke first', async () => {
			await visit(path, async (page) => {
				await click(page, 'Wake window');
				await expect.poll(text(page, '[data-window-taps]')).toBe('1');
				await click(page, 'Flip lamp');
				await expectRoom(page, 'on');
				await click(page, 'Wake lamp');
				await expect.poll(text(page, '[data-lamp-taps]')).toBe('1');
				await click(page, 'Flip window');
				await expectRoom(page, 'off');
			});
		});
	});
}

describe('a component on the same key rendered later in the browser', () => {
	test('opens with the value written before it, and its writes reach the first', async () => {
		await visit('/later', async (page) => {
			await click(page, 'Flip lamp');
			await expect.poll(text(page, '[data-lamp]')).toBe('on');
			await click(page, 'Show window');
			await expectRoom(page, 'on');
			await click(page, 'Flip window');
			await expectRoom(page, 'off');
			await click(page, 'Flip lamp');
			await expectRoom(page, 'on');
			await click(page, 'Wake window');
			await expect.poll(text(page, '[data-window-taps]')).toBe('1');
			await expect.poll(text(page, '[data-lamp-taps]')).toBe('0');
		});
	}, 20_000);

	test('opens again with the value written while it was closed', async () => {
		await visit('/later', async (page) => {
			await click(page, 'Show window');
			await click(page, 'Flip window');
			await expectRoom(page, 'on');
			await click(page, 'Show window');
			await click(page, 'Flip lamp');
			await expect.poll(text(page, '[data-lamp]')).toBe('off');
			await click(page, 'Show window');
			await expectRoom(page, 'off');
			await click(page, 'Flip window');
			await expectRoom(page, 'on');
			await page.reload();
			await page.waitForLoadState('networkidle');
			await expect.poll(text(page, '[data-lamp]')).toBe('on');
		});
	}, 20_000);
});
