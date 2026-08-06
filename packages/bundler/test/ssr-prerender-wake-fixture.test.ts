import { execFile } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { renderToString, type SsrRenderable } from '@markless/web';
import { MARKLESS_BUNDLE_GRAPH } from '../src/build/chunking.ts';
import { planModulePreloadUrls } from '../src/build/preload-plan.ts';

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
	// about what the CLIENT ships, so only /dist/build/ chunks count. A bare
	// containment count would also match render-data property keys, so the
	// derivation surface is the set of client chunks that EXPORT it.
	const clientChunks = chunks.filter((chunk) => chunk.path.includes('/dist/build/'));
	const wakeChunks = clientChunks.filter((chunk) =>
		/export\{[^}]*derivePrerenderResumeRecords/.test(chunk.source),
	);
	// Two client chunks carry that export name, one per ROLE, and that is the
	// intended shape: packages/web/src/fns/prerender-resume.ts moved the full
	// evaluator behind `import('../prerender/evaluator.ts')` so it stops
	// riding the load window, and re-exports the public name through a
	// forwarder. A dynamic import is a chunk boundary, so the facade and the
	// evaluator can no longer be one chunk. Pinning the roles instead of a
	// count keeps the original guard: a third chunk, or a second copy of
	// either role, fails here and names every path it found.
	const wakeChunkRoles = {
		// Full render-data evaluation. Reached only through the facade's import().
		'prerender-evaluator': /export\{[^}]*evaluatePrerenderClosure/,
		// Settle-kernel fast path plus the resume entry the wake entries call.
		'resume-facade': /export\{[^}]*resumeFromPrerenderRecords/,
	};
	const wakeRoles = wakeChunks.map((chunk) => ({
		path: `/build/${chunk.path.split('/build/')[1]}`,
		role:
			Object.entries(wakeChunkRoles).find(([, marker]) => marker.test(chunk.source))?.[0] ??
			'unrecognized-copy',
	}));
	expect(wakeRoles.map((entry) => entry.role).sort(), JSON.stringify(wakeRoles)).toEqual([
		'prerender-evaluator',
		'resume-facade',
	]);
	for (const { path } of wakeRoles) {
		expect(path).toMatch(/^\/build\/chunk-[A-Za-z0-9_-]+\.js$/);
	}
	const resumeFacade = wakeChunks[wakeRoles.findIndex((entry) => entry.role === 'resume-facade')]!;
	const evaluator =
		wakeChunks[wakeRoles.findIndex((entry) => entry.role === 'prerender-evaluator')]!;
	const evaluatorFile = escapeRegExp(evaluator.path.slice(evaluator.path.lastIndexOf('/') + 1));
	// Two chunks must not mean two copies of the same bytes. The facade reaches
	// the evaluator only lazily, and shares almost none of its content: at a
	// 120-byte window the measured overlap is one window in 67 (~1.5%), the
	// one-line leaf helpers both inline. Re-emitting the evaluator into the
	// facade would drive that ratio toward 1 and fail here.
	expect(resumeFacade.source).toMatch(new RegExp(`import\\([\`'"]\\./${evaluatorFile}[\`'"]\\)`));
	expect(resumeFacade.source).not.toMatch(new RegExp(`from\\s*[\`'"]\\./${evaluatorFile}`));
	expect(sharedContentRatio(resumeFacade.source, evaluator.source)).toBeLessThan(0.1);

	const clientClosure = clientChunks.map((chunk) => chunk.source).join('\n');
	// The minifier may emit string literals with backticks or quotes.
	expect(clientClosure).toMatch(/rootComponentName:[`"']WakePage[`"']/);
	expect(clientClosure).toMatch(/rootComponentName:[`"']WakeChild[`"']/);
	expect(clientClosure).toContain('resumeFromPrerenderRecords');
	const bundleGraph = JSON.parse(
		await readFile(resolve(dist, MARKLESS_BUNDLE_GRAPH), 'utf8'),
	) as Array<string | number>;

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
	const wakeFacade = clientChunks.find((chunk) => chunk.path.endsWith(resumeModuleUrl!));
	expect(wakeFacade).toBeDefined();
	// Each claimed page symbol resolves through code in the emitted per-page
	// wake facade, and every emitted symbol chunk sits in both its planned
	// preload closure and the concrete client HTML preload set.
	expect(
		wakeFacade?.source.match(/symbol:\d+[^;]{0,180}?import\([`"'][^`"']+\.js[`"']\)/g)
			?.length,
	).toBeGreaterThanOrEqual(3);
	const emittedSymbolChunks = clientChunks
		.filter((chunk) => /export\{[^}]*symbol_\d+_[a-z0-9]+/.test(chunk.source))
		.map((chunk) => `/build/${chunk.path.split('/build/')[1]}`)
		.sort();
	expect(emittedSymbolChunks.length).toBeGreaterThanOrEqual(3);
	const wakePreloadClosure = planModulePreloadUrls({
		bundleGraph,
		roots: [
			{
				name: resumeModuleUrl!.slice('/build/'.length),
				edges: 'dependencies-only',
			},
		],
		base: '/build/',
	});
	expect(wakePreloadClosure).toEqual(expect.arrayContaining(emittedSymbolChunks));
	const clientHtml = await readFile(resolve(dist, 'index.html'), 'utf8');
	for (const symbolChunk of emittedSymbolChunks) {
		expect(clientHtml).toContain(`rel=modulepreload href=${symbolChunk}`);
	}
}, 120_000);

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// How much of the smaller chunk appears verbatim in the larger one. Shipping a
// module's bytes twice drives this toward 1; independent implementations that
// merely inline the same one-line helpers sit near 0.
function sharedContentRatio(first: string, second: string, window = 120) {
	const [smaller, larger] = first.length <= second.length ? [first, second] : [second, first];
	let shared = 0;
	let total = 0;
	for (let index = 0; index + window <= smaller.length; index += window) {
		total += 1;
		if (larger.includes(smaller.slice(index, index + window))) shared += 1;
	}
	return total === 0 ? 0 : shared / total;
}

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
