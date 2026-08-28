/**
 * Prints the reading step each gallery section is reached at, which is what
 * `GALLERY_WALK_LIMIT` is sized from.
 *
 *   node apps/sr-gallery/scripts/measure-walk.ts
 *   SR_GALLERY_PORT=4338 node apps/sr-gallery/scripts/measure-walk.ts
 *
 * The virtual reader is a floor: NVDA and VoiceOver speak items it passes over
 * silently, so the shared limit takes a margin over what this prints.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { PREVIEW_ORIGIN } from '../preview-server.ts';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const BOOT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;
const PREWARM_TIMEOUT_MS = 600_000;
const MAX_STEPS = 2000;

const require = createRequire(import.meta.url);
const readerBundle = require.resolve('@guidepup/virtual-screen-reader/browser.js');

try {
	await fetch(PREVIEW_ORIGIN);
	console.error(`${PREVIEW_ORIGIN} already answers; set SR_GALLERY_PORT to a free port.`);
	process.exit(1);
} catch {
	// Nothing listening: the port is ours.
}

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
		// Already gone.
	}
}

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
	throw new Error(`The dev server never answered ${PREVIEW_ORIGIN}.`);
}

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

/** The dev server's first compile of the entry graph costs minutes; pay it here. */
async function prewarm(): Promise<void> {
	const deadline = Date.now() + PREWARM_TIMEOUT_MS;
	const queue = ['/'];
	const seen = new Set(queue);
	while (queue.length > 0) {
		const path = queue.shift() as string;
		let response: Response;
		let body: string;
		while (true) {
			const left = deadline - Date.now();
			if (left <= 0) throw new Error(`Pre-warm ran out of time on ${path}.`);
			try {
				response = await fetch(`${PREVIEW_ORIGIN}${path}`, {
					signal: AbortSignal.timeout(left),
				});
				body = await response.text();
				break;
			} catch (error) {
				if (server.exitCode !== null || server.signalCode !== null) throw error;
				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
			}
		}
		if (!response.ok || (path !== '/' && !path.startsWith('/src/'))) continue;
		for (const next of nextRequests(body)) {
			if (seen.has(next)) continue;
			seen.add(next);
			queue.push(next);
		}
	}
	console.log(`Pre-warmed ${seen.size} entry-graph requests.`);
}

async function main() {
	await waitForBoot();
	await prewarm();

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.route('**/__virtual-screen-reader.js', (route) =>
			route.fulfill({ path: readerBundle, contentType: 'text/javascript' }),
		);
		await page.goto(PREVIEW_ORIGIN, { waitUntil: 'load' });
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true', {
			timeout: 30_000,
		});

		const transcript = await page.evaluate(async (maxSteps) => {
			const { virtual } = (await import('/__virtual-screen-reader.js')) as {
				virtual: {
					start(options: { container: HTMLElement }): Promise<void>;
					next(): Promise<void>;
					lastSpokenPhrase(): Promise<string>;
					stop(): Promise<void>;
				};
			};
			await virtual.start({ container: document.body });
			const spoken: string[] = [await virtual.lastSpokenPhrase()];
			for (let step = 1; step <= maxSteps; step++) {
				await virtual.next();
				const phrase = await virtual.lastSpokenPhrase();
				if (phrase === spoken[spoken.length - 1] && phrase.startsWith('end of')) break;
				spoken.push(phrase);
			}
			await virtual.stop();
			return spoken;
		}, MAX_STEPS);

		const headings = await page.$$eval('section[id] > h2', (nodes) =>
			nodes.map((node) => ({
				id: (node.parentElement as HTMLElement).id,
				text: (node.textContent ?? '').trim(),
			})),
		);

		console.log(`\nThe virtual reader spoke ${transcript.length} phrases over the page.\n`);
		for (const { id, text } of headings) {
			const at = transcript.findIndex((phrase) => phrase.includes(text));
			console.log(`${String(at).padStart(5)}  #${id}  (heading "${text}")`);
		}
		console.log('\n--- full transcript ---');
		transcript.forEach((phrase, index) => console.log(`${String(index).padStart(5)}  ${phrase}`));
	} finally {
		await browser.close();
	}
}

try {
	await main();
	process.exitCode = 0;
} catch (error) {
	console.error(error instanceof Error ? error.stack : String(error));
	process.exitCode = 1;
} finally {
	signalServer('SIGTERM');
	setTimeout(() => {
		signalServer('SIGKILL');
		process.exit(process.exitCode ?? 0);
	}, 500);
}
