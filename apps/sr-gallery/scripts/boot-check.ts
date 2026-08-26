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
 * The server's first compile of the entry graph costs minutes, so the check
 * fetches that graph from node first and only then launches the browser. What
 * the browser is timed against is rendering, never compiling.
 *
 *   node apps/sr-gallery/scripts/boot-check.ts
 *   SR_GALLERY_PORT=4325 node apps/sr-gallery/scripts/boot-check.ts
 *
 * `SR_GALLERY_PORT` moves the whole app - this check, the server it spawns and
 * the vite config that binds - off the default 4319, so two worktrees can run
 * the check at the same time instead of tripping each other's squatter guard.
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
	tooltip: 'tooltip',
	'slider-range': 'slider',
	datebox: 'spinbutton',
	// The browse button is the family's whole keyboard route; the real file input
	// is aria-hidden, so the button is what has to be in the tree.
	fileupload: 'button',
	// The trigger is an <a> and only an <a>: the card is a shortcut to where that
	// link goes, so the link is the part that must have rendered.
	hovercard: 'link',
	// The days are real buttons and no grid: there is no gridcell to look for.
	calendar: 'button',
	// The surface is hidden until the trigger is pressed, so the trigger is the
	// part that has to be in the tree at rest.
	menu: 'button',
	colorpicker: 'slider',
};

/** Sections whose point is how many of that role they serve, not merely that they serve one. */
const RENDERED_COUNT: Partial<Record<FamilyName, number>> = {
	'slider-range': 2,
	// Three boxes, one per part of the date.
	datebox: 3,
	// Six weeks of days that never shrink, plus back and forward: a count catches
	// a month that rendered its header and none of its days.
	calendar: 44,
	// The plane is two sliders, one per axis, and the hue rail's thumb is a
	// third: a count catches a plane that rendered only one of its axes.
	colorpicker: 3,
};

const appDir = fileURLToPath(new URL('..', import.meta.url));
const BOOT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;
const PREWARM_TIMEOUT_MS = 600_000;

// A squatter on the port would answer waitForBoot for a server that never
// bound, so the check would read someone else's tree and go green. Probe
// BEFORE spawning our own server, while any answer must be foreign.
try {
	await fetch(PREVIEW_ORIGIN);
	console.error(
		`::error::${PREVIEW_ORIGIN} already answers before this check started its server — an orphaned dev server is squatting the port; kill it and rerun, or set SR_GALLERY_PORT to a free port.`,
	);
	process.exit(1);
} catch {
	// Nothing listening: the port is ours to take.
}

// `detached` puts pnpm and the vite server it spawns in one process group, so
// the teardown below can reach both. Measured without it: signalling pnpm alone
// left the vite process holding the port, and the next run of this check failed
// its own squatter guard against the server the previous run started.
const server = spawn('pnpm', ['exec', 'vp', 'dev'], {
	cwd: appDir,
	stdio: ['ignore', 'inherit', 'inherit'],
	env: process.env,
	detached: true,
});

function signalServer(signal: NodeJS.Signals) {
	try {
		if (server.pid === undefined) return;
		process.kill(-server.pid, signal);
	} catch {
		// Already gone, or never became a group of its own.
	}
}

let leaving = false;

function leave(code: number, message?: string) {
	if (leaving) return;
	leaving = true;
	if (message) console.error(`::error::${message}`);
	// Set before anything can end the process: the workflow reads this exit code
	// to decide whether the reader gets a page, so a failure that leaves through
	// an early drain of the event loop must still leave as a failure.
	process.exitCode = code;
	signalServer('SIGTERM');
	// The server owns a listening socket; give it a moment to let go of the port
	// before the next lane asks for it, then leave regardless.
	setTimeout(() => {
		signalServer('SIGKILL');
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

/** Same-origin requests a served document or module makes a browser issue next. */
function nextRequests(body: string): string[] {
	const specifiers: string[] = [];
	for (const [tag] of body.matchAll(/<script\b[^>]*>/gi)) {
		if (!/\btype\s*=\s*["']module["']/i.test(tag)) continue;
		const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
		if (src) specifiers.push(src[1]);
	}
	for (const pattern of [/\bfrom\s*["']([^"'\n]+)["']/g, /\bimport\s*["']([^"'\n]+)["']/g]) {
		for (const [, specifier] of body.matchAll(pattern)) specifiers.push(specifier);
	}
	const paths: string[] = [];
	for (const specifier of specifiers) {
		if (!/^(?:\/|\.{1,2}\/|https?:)/.test(specifier)) continue;
		let url: URL;
		try {
			url = new URL(specifier, PREVIEW_ORIGIN);
		} catch {
			continue;
		}
		if (url.origin !== new URL(PREVIEW_ORIGIN).origin) continue;
		paths.push(`${url.pathname}${url.search}`);
	}
	return paths;
}

/**
 * Pays the server's first compile of the entry graph from node, so the browser
 * phase below measures whether the page renders rather than how slow the
 * compiler is. Measured cold, that first compile is minutes; warm it is
 * milliseconds, and Chromium only ever gets the 30s below.
 */
async function prewarm(): Promise<void> {
	const deadline = Date.now() + PREWARM_TIMEOUT_MS;
	const started = Date.now();
	const queue = ['/'];
	const seen = new Set(queue);
	const fetched: string[] = [];

	while (queue.length > 0) {
		const path = queue.shift() as string;
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			throw new Error(
				`The dev server did not finish serving the entry module chain within ${PREWARM_TIMEOUT_MS / 60_000} minutes; ${path} was still unserved.`,
			);
		}
		const requestStarted = Date.now();
		let response: Response;
		let body: string;
		try {
			response = await fetch(`${PREVIEW_ORIGIN}${path}`, {
				signal: AbortSignal.timeout(remaining),
			});
			body = await response.text();
		} catch (error) {
			const name = error instanceof Error ? error.name : '';
			if (name === 'TimeoutError' || name === 'AbortError') {
				throw new Error(
					`The dev server was still compiling ${path} after ${PREWARM_TIMEOUT_MS / 60_000} minutes, so the pre-warm gave up before the browser was launched.`,
				);
			}
			throw error;
		}
		const ms = Date.now() - requestStarted;
		console.log(
			`Pre-warm: ${path} answered ${response.status} in ${ms} ms (${body.length} bytes).`,
		);
		if (path === '/' && !response.ok) {
			throw new Error(`The dev server answered ${response.status} for ${PREVIEW_ORIGIN}.`);
		}
		fetched.push(path);
		// Only the app's own source is walked further: a dependency chunk's imports
		// fan into the whole node_modules graph without warming anything more.
		if (!response.ok || (path !== '/' && !path.startsWith('/src/'))) continue;
		for (const next of nextRequests(body)) {
			if (seen.has(next)) continue;
			seen.add(next);
			queue.push(next);
		}
	}

	console.log(
		`Pre-warmed ${fetched.length} entry-graph requests in ${((Date.now() - started) / 1000).toFixed(1)}s: ${fetched.join(', ')}`,
	);
}

async function main() {
	await waitForBoot();
	await prewarm();

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
				failures.push(
					`#${section} rendered no role="${role}", so ${family} is not on the page.`,
				);
				continue;
			}
			const expected = RENDERED_COUNT[family];
			if (expected !== undefined && count !== expected) {
				failures.push(
					`#${section} rendered ${count} role="${role}" element(s), not the ${expected} ${family} serves.`,
				);
				continue;
			}
			console.log(
				`#${section} serves the ${family} family: ${count} role="${role}" element(s)`,
			);
		}

		const name = await page
			.getByRole('checkbox', { name: 'Checkbox Label' })
			.first()
			.getAttribute('aria-checked');
		if (name === null) {
			failures.push('The checkbox trigger has no accessible name "Checkbox Label".');
		} else {
			console.log(
				`The checkbox trigger is reachable by name and reads aria-checked="${name}".`,
			);
		}

		if (failures.length > 0) throw new Error(failures.join(' '));
	} finally {
		await browser.close();
	}

	console.log(`The gallery boots and renders every family at ${PREVIEW_ORIGIN}.`);
	leave(0);
}

main().catch((error) => leave(1, error instanceof Error ? error.message : String(error)));
