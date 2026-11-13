import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { marklessBuildManifestPath } from '../../../bundler/src/build/build-manifests.ts';
import { MARKLESS_BYTE_ATTRIBUTION } from '../../../bundler/src/build/chunking.ts';
import { clientAssetsManifestPath } from '../../src/vite/client-assets-manifest.ts';
import { buildFixture } from '../support/fixture-build.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');
const SUBMIT_HOLD = 'web/submit-hold';
const FORM_SEND = 'web/form-send';
let root = '';

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-submit-hold-preload-'));
	await mkdir(join(root, 'pages'), { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	await writeFile(
		join(root, 'pages/save.tsrx'),
		[
			'import { state } from "@markless/core";',
			'export default function Save() @{',
			'\tlet saved = state("");',
			'\t<form onSubmit={async (event) => {',
			'\t\tevent.preventDefault();',
			'\t\tconst name = String(new FormData(event.currentTarget as HTMLFormElement).get("name"));',
			'\t\tawait fetch("/save", { method: "POST", body: name });',
			'\t\tsaved = name;',
			'\t}}>',
			'\t\t<input name="name" value="Ada" />',
			'\t\t<button type="submit">Save</button>',
			'\t\t<p>{saved}</p>',
			'\t</form>',
			'}',
		].join('\n'),
	);
	await writeFile(
		join(root, 'pages/sent.tsrx'),
		[
			'export default function Sent() @{',
			'\t@try {',
			'\t\t<form method="post" action="/notes"><input name="note" /><button>Send</button></form>',
			'\t} @catch (error) {',
			'\t\t<p>{error.message}</p>',
			'\t}',
			'}',
		].join('\n'),
	);
	await writeFile(
		join(root, 'pages/fetch.tsrx'),
		[
			'import { state } from "@markless/core";',
			'export default function Fetch() @{',
			'\tlet answer = state("");',
			'\t<section><button type="button" onClick={async () => {',
			'\t\tconst response = await fetch("/answer");',
			'\t\tanswer = await response.text();',
			'\t}}>Ask</button>',
			'\t<p>{answer}</p></section>',
			'}',
		].join('\n'),
	);
	await buildFixture({ root });
}, 240_000);

afterAll(async () => {
	if (root) await rm(root, { recursive: true, force: true });
});

// The runtime modules a route's landing preloads, read from the router's route manifest and the build's byte attribution.
async function landingRuntime(routeFile: string): Promise<string[]> {
	const publicDir = join(root, '.output/public');
	const manifest = JSON.parse(await readFile(clientAssetsManifestPath(publicDir), 'utf8')) as {
		readonly routes: { readonly ssr: Record<string, readonly string[]> };
	};
	const attribution = JSON.parse(
		await readFile(marklessBuildManifestPath(publicDir, MARKLESS_BYTE_ATTRIBUTION), 'utf8'),
	) as { readonly chunks: Record<string, { readonly modules: ReadonlyArray<[string, string, number]> }> };
	const hrefs = manifest.routes.ssr[routeFile];
	expect(hrefs?.length).toBeGreaterThan(0);
	return hrefs!.flatMap((href) =>
		(attribution.chunks[href.split('/').pop()!]?.modules ?? []).flatMap(([category, id]) =>
			category === 'runtime' ? [id] : [],
		),
	);
}

test('a page whose form has an async submit handler preloads the submit hold, so a press waits on no fetch for it', async () => {
	expect(await landingRuntime('pages/save.tsrx')).toContain(SUBMIT_HOLD);
});

test('a page whose form is sent in place preloads its sender and the hold', async () => {
	expect(await landingRuntime('pages/sent.tsrx')).toEqual(expect.arrayContaining([FORM_SEND, SUBMIT_HOLD]));
});

test('a page that dispatches in full but has no form preloads neither', async () => {
	const runtime = await landingRuntime('pages/fetch.tsrx');
	expect(runtime).toContain('web/resume-events');
	expect(runtime).not.toContain(SUBMIT_HOLD);
	expect(runtime).not.toContain(FORM_SEND);
});
