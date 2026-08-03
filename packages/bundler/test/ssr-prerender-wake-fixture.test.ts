import { execFile } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { renderToString, type SsrRenderable } from '@markless/web';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-prerender-wake');
const dist = resolve(fixture, 'dist');

test('SSR client builds contain canonical linked render data and only eligible wake entries', async () => {
	await rm(dist, { force: true, recursive: true });
	await exec('pnpm', ['--filter', '@fixtures/vite-ssr-prerender-wake', 'build'], {
		cwd: root,
	});

	const chunks = await readJavaScriptChunks(dist);
	// The server build legitimately carries the derivation too; the pin is
	// about what the CLIENT ships, so only /dist/build/ chunks count. Rolldown
	// merges the tiny wake entry into the derivation facade, so the addressable
	// wake surface is the one client chunk that EXPORTS the derivation — a
	// bare containment count also matches render-data property keys.
	const clientChunks = chunks.filter((chunk) => chunk.path.includes('/dist/build/'));
	const wakeChunks = clientChunks.filter((chunk) =>
		/export\{[^}]*derivePrerenderResumeRecords/.test(chunk.source),
	);
	expect(wakeChunks).toHaveLength(1);
	expect(wakeChunks[0]!.path).toMatch(/\/build\/chunk-[A-Za-z0-9_-]+\.js$/);

	const clientClosure = clientChunks.map((chunk) => chunk.source).join('\n');
	// The minifier may emit string literals with backticks or quotes.
	expect(clientClosure).toMatch(/rootComponentName:[`"']WakePage[`"']/);
	expect(clientClosure).toMatch(/rootComponentName:[`"']WakeChild[`"']/);
	expect(clientClosure).toContain('resumeFromPrerenderRecords');

	const ineligible = chunks.find((chunk) =>
		chunk.source.includes('non-prerender-page-entry'),
	);
	expect(ineligible).toBeDefined();
	expect(ineligible!.source).not.toContain('marklessPrerenderData');
	expect(ineligible!.source).not.toContain('derivePrerenderResumeRecords');

	const serverEntry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as {
		readonly default: SsrRenderable;
		render(): Promise<string>;
	};
	const served = await serverEntry.render();
	const existingResumePath = await renderToString(serverEntry.default);
	// The served bundle carries the COMPILED inline resumer while the direct
	// render path inlines its uncompiled source, so raw byte-equality can
	// never hold; parity is everything outside inline script bodies.
	expect(withoutInlineScriptBodies(served)).toBe(
		withoutInlineScriptBodies(existingResumePath),
	);
	expect(served.match(/<script type="markless\/(?:state|view)">/g) ?? []).toHaveLength(0);
	expect(served).toContain('data-async-resumer');
	// The attribute must point at a real hash-addressed client chunk (the
	// wake-variant entry; the derivation facade asserted above is its import).
	const resumeModuleUrl = served.match(
		/data-markless-resume-module="(\/build\/chunk-[A-Za-z0-9_-]+\.js)"/,
	)?.[1];
	expect(resumeModuleUrl).toBeDefined();
	expect(
		clientChunks.some((chunk) => chunk.path.endsWith(resumeModuleUrl!)),
	).toBe(true);
}, 120_000);

function withoutInlineScriptBodies(html: string) {
	return html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/g, '$1$2');
}

async function readJavaScriptChunks(directory: string) {
	const chunks: Array<{ path: string; source: string }> = [];
	for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
		const path = resolve(entry.parentPath, entry.name);
		chunks.push({ path, source: await readFile(path, 'utf8') });
	}
	return chunks;
}
