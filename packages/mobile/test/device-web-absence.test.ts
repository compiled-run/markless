import { readFileSync } from 'node:fs';
import { compileTsrxModule, DEVICE_TARGET_FACTS } from '@markless/compiler';
import { describe, expect, it } from 'vitest';

// Web absence of `@markless/device`, compiled for the web under each candidate for a use that needs an answer:
// (a) `build-error` refuses it unless a `supported` check rules it out; (b) `reject` leaves it to the web module.
const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/w4/${name}.tsrx`, import.meta.url), 'utf8');

const web = (source: string, deviceWebAnswers: 'build-error' | 'reject' = 'build-error') =>
	compileTsrxModule({
		filename: 'src/App.tsrx',
		source,
		symbols: [],
		deviceTargetFacts: DEVICE_TARGET_FACTS,
		target: 'web',
		deviceWebAnswers,
	});

const clientCode = (compiled: Awaited<ReturnType<typeof web>>) =>
	[
		...compiled.symbolModules.modules.map((module) => module.source),
		compiled.publicRenderModule.renderDataModuleSource,
	].join('\n');

const codes = (compiled: Awaited<ReturnType<typeof web>>) =>
	compiled.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code);

describe('candidate a: a use that needs an answer must sit behind a check the build can see', () => {
	it.each(['location-a', 'photo-a'])(
		'%s builds, and its client code never names @markless/device',
		async (name) => {
			const compiled = await web(fixture(name));
			expect(codes(compiled)).toEqual([]);
			expect(clientCode(compiled)).not.toContain('@markless/device');
			expect(compiled.publicRenderModule.ssrModuleSource).not.toContain('takePhoto');
			expect(compiled.publicRenderModule.ssrModuleSource).not.toContain('location.current');
		},
	);

	it.each(['location-b', 'photo-b'])('%s, unguarded, is refused naming the use', async (name) => {
		const compiled = await web(fixture(name));
		expect(codes(compiled)).toContain('MARKLESS_DEVICE_WEB_ABSENT');
		expect(compiled.semanticGraph.diagnostics[0]!.message).toMatch(
			/needs an answer from `(location|camera)`/,
		);
	});

	it('removes a guarded early return and what follows it in a handler', async () => {
		const compiled = await web(`import { state } from '@markless/core';
import { camera } from '@markless/device';
export default function App() @{
	let photo = state('');
	<button onClick={async () => { if (!camera.supported) return; photo = (await camera.takePhoto()).url; }}>Take</button>
}
`);
		expect(codes(compiled)).toEqual([]);
		expect(clientCode(compiled)).toContain('if (true) return');
	});
});

describe('candidate b: the web module rejects, and the build says nothing', () => {
	it.each(['location-b', 'photo-b'])(
		'%s builds and its client code keeps the call',
		async (name) => {
			const compiled = await web(fixture(name), 'reject');
			expect(codes(compiled)).toEqual([]);
			expect(clientCode(compiled) + compiled.publicRenderModule.ssrModuleSource).toContain(
				'@markless/device',
			);
		},
	);
});
