import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

// A <select value> renders its option selected in the server's HTML, read with JavaScript off.
const packagesRoot = resolve(import.meta.dirname, '../../..');
let root: string;
let browser: Browser;
let app: BuiltServer;

const files: Record<string, string> = {
	'package.json': '{ "type": "module" }\n',
	'vite.config.ts': `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';

export default { plugins: [markless(), router()] };
`,
	'document.tsrx': `import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
		</head>
		<body>{children}</body>
	</Html>
}
`,
	'pages/size.tsrx': `import { state } from '@markless/core';

export default function Size() @{
	let size = state('m');

	<main>
		<select aria-label="Size" value={size} onChange={(event) => (size = event.currentTarget.value)}>
			<option value="s">Small</option>
			<option value="m">Medium</option>
		</select>
	</main>
}
`,
	'pages/crust.tsrx': `import { state } from '@markless/core';

export default function Crust() @{
	const crusts = state(['Thick', 'Thin', 'Stuffed']);
	let chosen = state('Stuffed');
	let shown = state(true);

	<section>
		@if (shown) {
			<label>
				Crust
				<select value={chosen} onChange={(event) => (chosen = event.currentTarget.value)}>
					@for (const crust of crusts; key crust) {
						<option>{crust}</option>
					}
				</select>
			</label>
		}
		<button onClick={() => (shown = !shown)}>Toggle</button>
	</section>
}
`,
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-yardstick-871-'));
	for (const [path, source] of Object.entries(files)) {
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
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await app?.close();
	await browser?.close();
	if (root) await rm(root, { recursive: true, force: true });
}, 60_000);

async function servedValue(path: string, label: string): Promise<string> {
	const context = await browser.newContext({ baseURL: app.origin, javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto(path);
		return await page.getByLabel(label).inputValue();
	} finally {
		await context.close();
	}
}

test('<select value> selects its option in the server HTML', async () => {
	expect(await servedValue('/size', 'Size')).toBe('m');
});

test('<select value> over options named by their text from a @for, inside an @if, selects its option in the server HTML', async () => {
	expect(await servedValue('/crust', 'Crust')).toBe('Stuffed');
});
