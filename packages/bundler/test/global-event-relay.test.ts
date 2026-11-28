import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// A page that owns no document or window record pays nothing for them: no relay in its
// HTML, no owner attribute, and no module of its graph names the relay chunk.

const page = (body: string) => `
import { state } from '@markless/core';

export default function App() @{
	let open = state(true);

	<main>
		<button type="button" onClick={() => (open = !open)}>Toggle</button>
		@if (open) { ${body} }
	</main>
}
`;
const WITH = page(`<dialog open onDocumentKeyDown={(event) => { if (event.key === 'Escape') open = false; }}>hi</dialog>`);
const WITHOUT = page(`<dialog open onKeyDown={(event) => { if (event.key === 'Escape') open = false; }}>hi</dialog>`);
const RELAY_CHUNK = '@markless/web/fns/global-relay';

const transformed = async (name: string, source: string, environment: 'client' | 'ssr') =>
	(await transformTsrxModule({ filename: `/workspace/app/src/${name}.tsrx`, source, environment })).code;

test('only a module whose elements own a document or window record names the relay chunk', async () => {
	const withClient = await transformed('With', WITH, 'client');
	expect(withClient).toContain(RELAY_CHUNK);
	expect(withClient).toContain('["document.keydown"]');
	for (const environment of ['client', 'ssr'] as const)
		expect(await transformed('Without', WITHOUT, environment)).not.toContain('global-relay');
});

test('served HTML carries the relay and the owner attribute only for a page that owns such a record', async () => {
	const { createServer } = await import('vite');
	const { markless } = await import('../src/vite/index.ts');
	const { renderToString } = await import('@markless/web');
	const sources: Record<string, string> = { '/global-with.tsrx': WITH, '/global-without.tsrx': WITHOUT };
	const server = await createServer({
		root: new URL('..', import.meta.url).pathname,
		configFile: false,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true },
		plugins: [
			{
				name: 'global-event-fixture',
				resolveId: (candidate) => (sources[candidate] ? '\0' + candidate : null),
				load: (candidate) => sources[candidate.slice(1)] ?? null,
			},
			markless() as never,
		],
	});
	try {
		const html = async (id: string) =>
			renderToString((await server.ssrLoadModule(id)).default, {
				executionLog: 'never',
				resumeModuleUrl: '/resume.js',
			});
		const withHtml = await html('/global-with.tsrx');
		expect(withHtml).toContain('m:g="document.keydown"');
		expect(withHtml).toContain('["document.keydown"]');
		const withoutHtml = await html('/global-without.tsrx');
		expect(withoutHtml).not.toContain('m:g=');
		expect(withoutHtml).not.toContain('document.keydown');
		expect(withoutHtml).not.toContain('__mGR');
	} finally {
		await server.close();
	}
}, 30000);
