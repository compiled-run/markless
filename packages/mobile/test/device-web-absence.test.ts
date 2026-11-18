import { readFileSync } from 'node:fs';
import { compileTsrxModule, DEVICE_TARGET_FACTS } from '@markless/compiler';
import { describe, expect, it } from 'vitest';

// Web absence of `@markless/device`: a use that needs an answer builds only inside a `platform` check the build can
// see in the same component; anything else is refused naming that check.
const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/web-guard/${name}.tsrx`, import.meta.url), 'utf8');

const web = (source: string) =>
	compileTsrxModule({
		filename: 'src/App.tsrx',
		source,
		symbols: [],
		deviceTargetFacts: DEVICE_TARGET_FACTS,
		target: 'web',
	});

const clientCode = (compiled: Awaited<ReturnType<typeof web>>) =>
	[
		...compiled.symbolModules.modules.map((module) => module.source),
		compiled.publicRenderModule.renderDataModuleSource,
	].join('\n');

const codes = (compiled: Awaited<ReturnType<typeof web>>) =>
	compiled.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code);

describe('a use that needs an answer sits behind a platform check in its own component', () => {
	it.each(['location-guarded', 'photo-guarded', 'location-parent-guard'])(
		'%s builds, and its client code never names @markless/device',
		async (name) => {
			const compiled = await web(fixture(name));
			expect(codes(compiled)).toEqual([]);
			expect(clientCode(compiled)).not.toContain('@markless/device');
			expect(compiled.publicRenderModule.ssrModuleSource).not.toContain('takePhoto');
			expect(compiled.publicRenderModule.ssrModuleSource).not.toContain('location.current');
		},
	);

	it.each(['location-unguarded', 'photo-unguarded'])(
		'%s, unguarded, is refused naming the use and a platform check',
		async (name) => {
			const compiled = await web(fixture(name));
			expect(codes(compiled)).toContain('MARKLESS_DEVICE_WEB_ABSENT');
			expect(compiled.semanticGraph.diagnostics[0]!.message).toMatch(
				/needs an answer from `(location|camera)`.*put it inside a `platform` check/,
			);
		},
	);

	it("a child in another file is not covered by its parent's check, and the message says where the check goes", async () => {
		const compiled = await web(fixture('location-child'));
		expect(codes(compiled)).toEqual(['MARKLESS_DEVICE_WEB_ABSENT']);
		expect(compiled.semanticGraph.diagnostics[0]!.message).toContain(
			'in the component that uses it (a check in a parent in another file does not cover it)',
		);
	});

	it('a `supported` field is no check: the build refuses it as a use', async () => {
		const compiled = await web(`import { location } from '@markless/device';
export default function App() @{
	<main>
		@if (location.supported) {
			<p>Here</p>
		}
	</main>
}
`);
		expect(codes(compiled)).toEqual(['MARKLESS_DEVICE_WEB_ABSENT']);
	});

	it('removes a guarded early return and what follows it in a handler', async () => {
		const compiled = await web(`import { state } from '@markless/core';
import { location, platform } from '@markless/device';
export default function App() @{
	let where = state(0);
	<button onClick={async () => { if (platform.web) return; where = (await location.current()).latitude; }}>Where</button>
}
`);
		expect(codes(compiled)).toEqual([]);
		expect(clientCode(compiled)).toContain('if (true) return');
	});
});

describe('W2: a device element renders nothing on the web', () => {
	const part = readFileSync(
		new URL('../../headless/components/src/base/camera.tsrx', import.meta.url),
		'utf8',
	);

	it('base.camera compiles to no markup on a web build, and keeps it for a phone', async () => {
		const onWeb = await web(part);
		expect(codes(onWeb)).toEqual([]);
		expect(
			onWeb.semanticGraph.markup.chunks.flatMap((chunk) => chunk.statics).join(''),
		).not.toContain('ui-camera');
		const onPhone = await compileTsrxModule({
			filename: 'src/camera.tsrx',
			source: part,
			symbols: [],
			target: 'ios',
			deviceTargetFacts: DEVICE_TARGET_FACTS,
		});
		expect(
			onPhone.semanticGraph.markup.chunks.flatMap((chunk) => chunk.statics).join(''),
		).toContain('ui-camera');
	});
});

describe('native.* elements do not exist on the web', () => {
	const page = (tag: string, guarded: boolean, imports = 'native, platform') => `import { state } from '@markless/core';
import { ${imports} } from '@markless/device';
export default function App() @{
	let open = state(false);
	<main>
		<button onClick={() => (open = true)}>Open</button>
		${guarded ? '@if (!platform.web) {' : ''}
			<${tag} open={open} onChange={(next) => (open = next)}><p>Only on a phone</p></${tag}>
		${guarded ? '} @else { <p>On the web, a drawer</p> }' : ''}
	</main>
}`;

	it.each(['native.sheet', 'native.camera'])(
		'a guarded <%s> builds, and neither client nor server code carries it',
		async (tag) => {
			const compiled = await web(page(tag, true));
			expect(codes(compiled)).toEqual([]);
			expect(clientCode(compiled)).not.toContain('@markless/device');
			for (const code of [clientCode(compiled), compiled.publicRenderModule.ssrModuleSource]) {
				expect(code).not.toContain('Only on a phone');
				expect(code).not.toContain(tag);
			}
		},
	);

	it.each([
		['native.sheet', 'native, platform'],
		['native.camera', 'native, platform'],
		['shown.sheet', 'native as shown, platform'],
	])('an unguarded <%s> is refused, telling the author to guard it and what to use on the web', async (tag, imports) => {
		const compiled = await web(page(tag, false, imports));
		expect(codes(compiled)).toEqual(['MARKLESS_DEVICE_WEB_ABSENT']);
		expect(compiled.semanticGraph.diagnostics[0]!.message).toBe(
			[
				`\`<${tag}>\` does not exist on the web: everything under \`native.*\` is drawn by iOS or Android. Guard it in the component that renders it, and draw the web's version with \`drawer\` from @markless/ui:`,
				'',
				'\t@if (!platform.web) {',
				`\t\t<${tag} …>…</${tag}>`,
				'\t} @else {',
				'\t\t<drawer.root …>…</drawer.root>',
				'\t}',
				'',
				'`platform` comes from @markless/device. `modal` or a plain `<dialog>` also work for the web.',
			].join('\n'),
		);
	});
});
