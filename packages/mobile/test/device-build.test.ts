import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileNativeComponent } from '../src/index.ts';
import { DEVICE_USAGE_MISSING_CODE } from '../src/permissions.ts';

const build = (source: string, usage?: Record<string, string>, scriptHandlers?: 'never') =>
	compileNativeComponent({
		filename: 'src/App.tsrx',
		source,
		...(usage ? { device: { usage } } : {}),
		...(scriptHandlers ? { scriptHandlers } : {}),
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

	it('fails the build naming the feature and the Info.plist key when the usage text is missing', async () => {
		const result = await build(locationApp);
		expect(result.payload).toBeNull();
		expect(result.diagnostics.map((d) => [d.code, d.message])).toEqual([
			[
				DEVICE_USAGE_MISSING_CODE,
				'location needs usage text for NSLocationWhenInUseUsageDescription; add device.usage.location to the app config',
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
function save() {
	fetch('/save');
}
function nothing() {}
export default function App() @{
	let n = state(0);
	<button onClick={${body}}>Go {n}</button>
}
`;
	const refusal = async (body: string) =>
		(await build(handler(body), { location: 'x' }, 'never')).diagnostics.map((d) => d.message);

	it('lowers a device call statement to a call op', async () => {
		const result = await build(handler('() => { n++; haptics.tap(); }'));
		expect(result.payload?.handlers[0]?.ops.at(-1)).toEqual({
			op: 'call',
			call: 'haptics.tap',
			arguments: [],
		});
	});

	it('still refuses a call to author code by name when handlers are data only', async () => {
		expect(await refusal('() => save()')).toEqual([
			'the click handler uses a call to `fetch`, which needs a script engine',
		]);
	});

	it('runs a call to author code as JavaScript by default', async () => {
		const result = await build(handler('() => save()'));
		expect(result.diagnostics).toEqual([]);
		expect(result.payload?.handlers[0]?.ops).toEqual([{ op: 'script', fn: 'fn:0', type: 'click', bindings: {} }]);
		expect(result.payload?.script?.services).toEqual(['fetch']);
	});

	it('refuses a device value read inside JavaScript by name, file and position', async () => {
		const source = handler('() => { for (const access of [location.access]) n = access.length; }');
		const result = await build(source, { location: 'x' });
		const start = source.indexOf('location.access');
		expect(result.diagnostics.map((d) => [d.code, d.message, d.primarySpan])).toEqual([
			[
				'MARKLESS_NATIVE_JAVASCRIPT',
				'the click handler calls `location` from @markless/device inside JavaScript that runs on the phone, which it cannot reach there yet',
				{ filename: 'src/App.tsrx', start, end: start + 'location'.length },
			],
		]);
	});

	it('runs a module function called for its effects where it is called', async () => {
		const result = await build(handler('() => { nothing(); n++; }'));
		expect(result.diagnostics).toEqual([]);
		expect(result.payload?.handlers[0]?.ops).toHaveLength(1);
	});

	it('refuses a device call used as a value', async () => {
		expect(await refusal('() => (n = location.current())')).toEqual([
			"the click handler calls `location.current` inside an expression; call it as a handler statement or as an async computed's body",
		]);
	});

	it("runs the statements after an await as the call's continuation, still data", async () => {
		const result = await build(handler('async () => { await haptics.tap(); n++; }'));
		expect(result.diagnostics).toEqual([]);
		expect(result.payload?.handlers[0]?.ops).toEqual([
			{
				op: 'call',
				call: 'haptics.tap',
				arguments: [],
				after: {
					id: 'handler:event:0:after:0',
					as: '$0',
					ops: [
						{
							op: 'assign',
							cell: 'state:n',
							value: {
								binary: '+',
								left: { unary: '+', value: { cell: 'state:n' } },
								right: { literal: 1 },
							},
						},
					],
				},
			},
		]);
	});

	it('refuses two awaits in one statement', async () => {
		expect(
			await refusal(
				'async () => { n = (await location.current()).latitude + (await location.current()).longitude; }',
			),
		).toEqual(['the click handler awaits more than once in one statement']);
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

	it('lowers <native.camera>, ready for the native namespace, and <base.camera> to the same camera element', async () => {
		const shooter = (namespace: string) => `import { camera } from '@markless/device';
import { ${namespace} } from '@markless/ui';
export default function App() @{
	const cam = camera();
	<main>
		<${namespace}.camera el={cam} />
		<p>{cam.ready ? 'ready' : 'starting'}</p>
	</main>
}
`;
		const usage = { camera: 'Takes the photo you ask for.' };
		const preferred = await build(shooter('native'), usage);
		const alias = await build(shooter('base'), usage);
		expect(preferred.diagnostics).toEqual([]);
		expect(preferred.payload?.nodes).toContainEqual(
			expect.objectContaining({ element: 'camera', object: 'object:cam' }),
		);
		expect(alias.payload).toEqual(preferred.payload);
		expect(preferred.features).toEqual(['camera']);
	});
});
