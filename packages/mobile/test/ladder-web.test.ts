import {
	copyFile,
	cp,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromium, type Browser, type Locator, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { launchBrowser } from '../../../scripts/test-utils/browser.ts';
import { startBuiltServer } from '../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../../router/test/support/fixture-build.ts';
import {
	callsText,
	proofsDir,
	readRung,
	rungFolders,
	type LadderRung,
	type LadderStep,
} from '../proofs/ladder.ts';

// The web column of the ladder: each rung's App.tsrx built as the page of a real router app,
// served by its production server and driven through the steps its expected.json lists.
const packagesRoot = resolve(import.meta.dirname, '../..');
const documentSource = `import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
		</head>
		<body>{children}</body>
	</Html>
}
`;

let browser: Browser;
const cleanups: Array<() => Promise<void> | void> = [];

beforeAll(async () => {
	browser = await launchBrowser(chromium);
}, 60_000);

afterAll(() => browser.close(), 60_000);

async function serveRung(
	folder: string,
	rung: LadderRung,
): Promise<{ origin: string; root: string }> {
	const root = await mkdtemp(join(tmpdir(), `markless-ladder-${folder}-`));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	const page = join(root, 'pages', `${rung.route ?? 'index'}.tsrx`);
	await mkdir(dirname(page), { recursive: true });
	await copyFile(join(proofsDir, folder, 'App.tsrx'), page);
	// Components a rung imports live in proofs/lib, which a page reaches as `../lib/...` from pages/ here too.
	await cp(join(proofsDir, 'lib'), join(root, 'lib'), { recursive: true });
	await writeFile(join(root, 'document.tsrx'), documentSource);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router', 'device'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const nodeEnv = process.env.NODE_ENV;
	// Vitest's NODE_ENV=test leaves import.meta.env.DEV true in a build.
	process.env.NODE_ENV = 'production';
	try {
		await buildFixture({ root });
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	cleanups.push(() => server.close());
	return { origin: server.origin, root };
}

// The browser APIs `@markless/device` calls on the web, each recorded under the device call that made it.
function recordDeviceCalls() {
	const calls: string[] = [];
	(window as { __marklessDeviceCalls?: string[] }).__marklessDeviceCalls = calls;
	Object.defineProperty(Navigator.prototype, 'vibrate', {
		configurable: true,
		value: () => {
			calls.push('haptics.tap');
			return true;
		},
	});
}

// A visible text or an accessible name, the two ways a Maestro selector finds a view.
const shown = (page: Page, text: string): Locator =>
	page.getByText(text, { exact: true }).or(page.getByLabel(text, { exact: true }));

async function act(page: Page, step: LadderStep) {
	const action = step.do;
	if (!action) return;
	if ('tap' in action) await shown(page, action.tap).click();
	else if ('type' in action) {
		const field = page.getByRole('textbox', { name: action.type.field, exact: true });
		await field.fill('');
		await field.pressSequentially(action.type.text);
	} else if ('relaunch' in action) await page.reload();
	else await page.clock.runFor(action.wait);
}

// Every expectation of a step read at one moment, so a screen the action has not reached yet cannot pass.
async function mismatches(page: Page, step: LadderStep): Promise<string[]> {
	const failed: string[] = [];
	const onScreen = (text: string) => shown(page, text).filter({ visible: true });
	for (const text of step.visible)
		if ((await onScreen(text).count()) === 0) failed.push(`"${text}" is not on screen`);
	for (const text of step.absent ?? [])
		if ((await onScreen(text).count()) > 0) failed.push(`"${text}" is on screen`);
	for (const text of step.disabled ?? [])
		if ((await onScreen(text).count()) === 0 || !(await onScreen(text).first().isDisabled()))
			failed.push(`"${text}" is not a disabled control on screen`);
	for (const [name, value] of Object.entries(step.fields ?? {})) {
		const held = await page.getByRole('textbox', { name, exact: true }).inputValue();
		if (held !== value) failed.push(`field "${name}" holds "${held}"`);
	}
	if (step.calls) {
		const made = await page.evaluate(
			() => (window as { __marklessDeviceCalls?: string[] }).__marklessDeviceCalls ?? [],
		);
		if (callsText(made) !== callsText(step.calls)) failed.push(`device ${callsText(made)}`);
	}
	if (step.order) {
		const tops: number[] = [];
		for (const text of step.order)
			tops.push((await onScreen(text).first().boundingBox())?.y ?? NaN);
		if (tops.some((top, index) => !(index === 0 || top > tops[index - 1]!)))
			failed.push(`order ${step.order.join(', ')} is not top to bottom`);
	}
	return failed;
}

describe.each(rungFolders())('%s', (folder) => {
	const rung = readRung(folder);
	let origin = '';

	let built = '';
	beforeAll(async () => {
		({ origin, root: built } = await serveRung(folder, rung));
	}, 240_000);

	const absent = rung.web?.absentFromOutput;
	if (absent)
		test(`${rung.name}: the web build's output has no trace of what is absent on the web`, async () => {
			const found: string[] = [];
			for (const file of await readdir(join(built, '.output'), { recursive: true })) {
				const path = join(built, '.output', file);
				if (!(await stat(path)).isFile()) continue;
				const text = await readFile(path, 'utf8');
				for (const needle of absent)
					if (text.includes(needle)) found.push(`${needle} in ${file}`);
			}
			expect(found).toEqual([]);
		});

	afterAll(async () => {
		for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	}, 60_000);

	test(
		`${rung.name}: the web build shows every step's expected texts`,
		{ timeout: 60_000 },
		async () => {
			const context = await browser.newContext();
			await context.addInitScript(recordDeviceCalls);
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			if (rung.steps.some((step) => step.do && 'wait' in step.do)) await page.clock.install();
			await page.goto(`${origin}${rung.start ?? '/'}`);
			if (rung.steps.some((step) => step.do && 'wait' in step.do))
				await page.clock.pauseAt(Date.now() + 60_000);
			for (const [index, authored] of (rung.web?.steps ?? rung.steps).entries()) {
				const step = {
					...authored,
					visible: [...authored.visible, ...(authored.visibleOn?.web ?? [])],
				};
				await act(page, step);
				await expect
					.poll(() => mismatches(page, step), {
						timeout: 10_000,
						message: `step ${index}`,
					})
					.toEqual([]);
			}
			expect(errors).toEqual([]);
			await context.close();
		},
	);
});
