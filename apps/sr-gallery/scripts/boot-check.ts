/**
 * Proves the gallery actually serves and renders before a real screen reader is
 * asked to read it.
 *
 * The screen-reader lanes are expensive and their failures are hard to read: a
 * reader that says nothing looks the same whether the automation permission is
 * missing or the page never rendered. This separates those two. It starts the
 * dev server, loads the page in Chromium, and checks each family's landmark
 * role is in the DOM a reader would walk.
 *
 * Exit 0 means the gallery serves and renders, so a red reader lane afterwards
 * is about the reader or the announcement. Exit 1 names what was missing, and
 * the workflow falls back to the drivability smoke.
 *
 *   node apps/sr-gallery/scripts/boot-check.ts
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN, type FamilyName } from '../preview-server.ts';

type AriaRole = Parameters<Page['getByRole']>[0];

/** The role each family puts in the accessibility tree when it has rendered. */
const RENDERED_ROLE: Record<FamilyName, AriaRole> = {
	checkbox: 'checkbox',
	toggle: 'switch',
	textbox: 'textbox',
	progress: 'progressbar',
	checklist: 'checkbox',
	select: 'combobox',
	// A closed dialog is in the tree behind a hidden backdrop, so its role is in
	// the DOM whether or not the trigger has been pressed.
	modal: 'dialog',
	'radio-group': 'radiogroup',
	tabs: 'tablist',
	// Closed hides the surface but never detaches it, so the dialog role is in the
	// DOM before the trigger is pressed.
	popover: 'dialog',
	slider: 'slider',
};

const appDir = fileURLToPath(new URL('..', import.meta.url));
const BOOT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;

const server = spawn('pnpm', ['exec', 'vp', 'dev'], {
	cwd: appDir,
	stdio: ['ignore', 'inherit', 'inherit'],
	env: process.env,
});

let leaving = false;

function leave(code: number, message?: string) {
	if (leaving) return;
	leaving = true;
	if (message) console.error(`::error::${message}`);
	// Set before anything can end the process: the workflow reads this exit code
	// to decide whether the reader gets a page, so a failure that leaves through
	// an early drain of the event loop must still leave as a failure.
	process.exitCode = code;
	server.kill('SIGTERM');
	// The server owns a listening socket; give it a moment to let go of the port
	// before the next lane asks for it, then leave regardless.
	setTimeout(() => {
		server.kill('SIGKILL');
		process.exit(code);
	}, 500);
}

server.on('exit', (code) => {
	if (!leaving) leave(1, `The dev server exited with code ${code} before it answered.`);
});

async function waitForBoot(): Promise<void> {
	const deadline = Date.now() + BOOT_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(PREVIEW_ORIGIN);
			if (response.ok) return;
		} catch {
			// Not listening yet.
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	throw new Error(
		`The dev server never answered ${PREVIEW_ORIGIN} within ${BOOT_TIMEOUT_MS / 1000}s.`,
	);
}

async function main() {
	await waitForBoot();

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const failures: string[] = [];
		page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));

		await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.checkbox}`, { waitUntil: 'load' });
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true', {
			timeout: 30_000,
		});

		for (const [family, anchor] of Object.entries(FAMILY_ANCHORS) as [FamilyName, string][]) {
			const section = anchor.slice(anchor.indexOf('#') + 1);
			const role = RENDERED_ROLE[family];
			// Roles are read off the accessibility tree, not off a `role` attribute:
			// a native <input> is a textbox without ever spelling the role out.
			const count = await page
				.locator(`#${section}`)
				.getByRole(role, { includeHidden: true })
				.count();
			if (count === 0) {
				failures.push(`#${section} rendered no role="${role}", so ${family} is not on the page.`);
				continue;
			}
			console.log(`#${section} serves the ${family} family: ${count} role="${role}" element(s)`);
		}

		const name = await page
			.getByRole('checkbox', { name: 'Checkbox Label' })
			.first()
			.getAttribute('aria-checked');
		if (name === null) {
			failures.push('The checkbox trigger has no accessible name "Checkbox Label".');
		} else {
			console.log(`The checkbox trigger is reachable by name and reads aria-checked="${name}".`);
		}

		if (failures.length > 0) throw new Error(failures.join(' '));
	} finally {
		await browser.close();
	}

	console.log(`The gallery boots and renders every family at ${PREVIEW_ORIGIN}.`);
	leave(0);
}

main().catch((error) => leave(1, error instanceof Error ? error.message : String(error)));
