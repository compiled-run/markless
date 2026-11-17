import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileNativeComponent } from '../src/index.ts';
import { DEVICE_USAGE_MISSING_CODE } from '../src/permissions.ts';

const build = (source: string, usage?: Record<string, string>) =>
	compileNativeComponent({
		filename: 'src/App.tsrx',
		source,
		...(usage ? { device: { usage } } : {}),
	});

const locationApp = readFileSync(
	new URL('../proofs/d3-location/App.tsrx', import.meta.url),
	'utf8',
);

describe('device features in a native build', () => {
	it('derives the location entries from the import the page uses', async () => {
		const result = await build(locationApp, { location: 'Shows where you are.' });
		expect(result.diagnostics).toEqual([]);
		expect(result.features).toEqual(['location']);
		expect(result.manifest).toEqual({
			ios: [{ key: 'NSLocationWhenInUseUsageDescription', text: 'Shows where you are.' }],
			android: [
				'android.permission.ACCESS_COARSE_LOCATION',
				'android.permission.ACCESS_FINE_LOCATION',
			],
		});
	});

	it('fails the build naming the Info.plist key when the usage text is missing', async () => {
		const result = await build(locationApp);
		expect(result.payload).toBeNull();
		expect(result.diagnostics.map((d) => [d.code, d.message])).toEqual([
			[
				DEVICE_USAGE_MISSING_CODE,
				'NSLocationWhenInUseUsageDescription has no usage text; add device.usage.location to the app config',
			],
		]);
	});

	it('asks nothing of a page that uses no device feature, even when it imports one under another name', async () => {
		const result = await build(`import { state } from '@markless/core';
import { network as net } from '@markless/device';
export default function App() @{
	let open = state(false);
	<p>{open ? 'open' : 'shut'}</p>
}
`);
		expect(result.diagnostics).toEqual([]);
		expect(result.features).toEqual([]);
		expect(result.manifest).toEqual({ ios: [], android: [] });
	});

	it('follows an aliased import to the device value it names', async () => {
		const result = await build(`import { network as connection } from '@markless/device';
export default function App() @{
	<p>{connection.online ? 'up' : 'down'}</p>
}
`);
		expect(result.diagnostics).toEqual([]);
		expect(result.payload?.cells).toEqual([
			{
				id: 'device:network.online',
				name: 'network.online',
				initial: true,
				device: 'network.online',
			},
		]);
		expect(result.manifest.android).toEqual(['android.permission.ACCESS_NETWORK_STATE']);
	});

	it('does not treat a same-named object from another module as the device', async () => {
		const result = await build(`import { network } from './my-network.ts';
export default function App() @{
	<p>{network.online ? 'up' : 'down'}</p>
}
`);
		expect(result.payload).toBeNull();
		expect(result.features).toEqual([]);
	});
});

describe('which handlers run as data', () => {
	const handler = (body: string) => `import { state } from '@markless/core';
import { haptics, location } from '@markless/device';
function save() {}
export default function App() @{
	let n = state(0);
	<button onClick={${body}}>Go {n}</button>
}
`;
	const refusal = async (body: string) =>
		(await build(handler(body), { location: 'x' })).diagnostics.map((d) => d.message);

	it('lowers a device call statement to a call op', async () => {
		const result = await build(handler('() => { n++; haptics.tap(); }'));
		expect(result.payload?.handlers[0]?.ops.at(-1)).toEqual({
			op: 'call',
			call: 'haptics.tap',
			arguments: [],
		});
	});

	it('still refuses a call to author code by name', async () => {
		expect(await refusal('() => save()')).toEqual([
			'the click handler uses a call to `save`, which needs a script engine',
		]);
	});

	it('refuses a device call used as a value', async () => {
		expect(await refusal('() => (n = location.current())')).toEqual([
			"the click handler calls `location.current` inside an expression; call it as a handler statement or as an async computed's body",
		]);
	});

	it('refuses a statement after an await', async () => {
		expect(await refusal('async () => { await haptics.tap(); n++; }')).toEqual([
			'the click handler has a statement after an `await`; a handler as data may await only in its last statement',
		]);
	});

	it('refuses an async value read outside @try', async () => {
		const result = await build(
			`import { computed } from '@markless/core';
import { location } from '@markless/device';
export default function App() @{
	const here = computed(async () => location.current());
	<p>{here.latitude}</p>
}
`,
			{ location: 'x' },
		);
		expect(result.diagnostics.map((d) => d.message)).toContain(
			'a text expression reads the async value `here` outside a @try',
		);
	});
});
