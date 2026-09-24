import { expect, test } from 'vitest';
import { compileTsrxModule } from '@markless/compiler';
import { PROTOCOL_VISIBLE_EVENT_NAME } from '@markless/serializer';
import { undemandedRuntimeModules } from '../src/build/undemanded-runtime.ts';
import type { RuntimeDemandMapManifest } from '../src/types.ts';

const dispatch = ['web/resume-runtime', 'web/resume-events'];

function demand(overrides: Partial<RuntimeDemandMapManifest> = {}): RuntimeDemandMapManifest {
	return {
		version: 1,
		recordKinds: [
			{ kind: 'event', replaced: false },
			{ kind: 'branch', replaced: false },
		],
		symbols: [
			{ symbolId: 'symbol:0', kind: 'event-handler', runtimeModuleIds: ['web/fns/write'] },
		],
		payloadRecords: [
			{
				recordId: 'event:h1:click',
				kind: 'event',
				hostNodeId: 'h1',
				eventName: 'click',
				symbolIds: ['symbol:0'],
				runtimeModuleIds: [...dispatch, 'web/fns/write'],
			},
		],
		actions: [],
		unknownRecordModuleIds: [...dispatch, 'web/resume-branches', 'web/dom-journal'],
		...overrides,
	};
}

const moduleIds = [
	'/repo/packages/web/src/resume-runtime.ts',
	'/repo/packages/web/src/resume-events.ts',
	'/repo/packages/web/src/resume-branches.ts',
	'/repo/packages/web/src/dom-journal.ts?direct',
	'/repo/packages/web/src/fns/write.ts',
	'/repo/app/page.tsrx?markless-resume',
];

test('names runtime modules no compiled record demands', () => {
	expect(undemandedRuntimeModules({ demandMaps: [demand()], moduleIds })).toEqual(
		new Set([
			'/repo/packages/web/src/resume-branches.ts',
			'/repo/packages/web/src/dom-journal.ts?direct',
		]),
	);
});

test('any module demanding a capability keeps it for the whole build', () => {
	const second = demand({
		payloadRecords: [
			...demand().payloadRecords,
			{
				recordId: 'dom-update:h2:',
				kind: 'dom-update',
				runtimeModuleIds: ['web/dom-journal'],
			},
		],
	});
	expect(undemandedRuntimeModules({ demandMaps: [demand(), second], moduleIds })).toEqual(
		new Set(['/repo/packages/web/src/resume-branches.ts']),
	);
});

test('open demand defers nothing', () => {
	const open: Array<ReadonlyArray<RuntimeDemandMapManifest | undefined>> = [
		[],
		[demand(), undefined],
		[demand({ recordKinds: [{ kind: 'event', replaced: true }] })],
		[
			demand({
				payloadRecords: [
					...demand().payloadRecords,
					{
						recordId: 'branch:b0',
						kind: 'branch',
						runtimeModuleIds: ['web/resume-branches'],
					},
				],
			}),
		],
		[
			demand({
				payloadRecords: [
					{
						recordId: 'keyed-repeat:r0',
						kind: 'keyed-repeat',
						runtimeModuleIds: dispatch,
					},
				],
			}),
		],
		[demand({ payloadRecords: [] })],
	];
	for (const demandMaps of open)
		expect(undemandedRuntimeModules({ demandMaps, moduleIds })).toEqual(new Set());
});

test('a visible event keeps the behavior runtime the resume runtime installs at startup', async () => {
	const behaviors = '/repo/packages/web/src/resume-behaviors.ts';
	const compiled = async (source: string) =>
		(await compileTsrxModule({ filename: '/workspace/src/Page.tsrx', symbols: [], source }))
			.runtimeDemandMaps.prerender;
	const header = `import { state } from '@markless/core';\nexport default function Page() @{ let n = state(0);`;
	const clickOnly = await compiled(`${header} <p><b onClick={() => n++}>{n}</b></p> }`);
	const visible = await compiled(
		`${header} <p><b onClick={() => n++}>{n}</b><i onVisible={() => n++}>v</i></p> }`,
	);
	expect(visible.payloadRecords.map((record) => record.eventName)).toContain(
		PROTOCOL_VISIBLE_EVENT_NAME,
	);
	const ids = [...moduleIds, behaviors];
	expect(undemandedRuntimeModules({ demandMaps: [clickOnly], moduleIds: ids })).toContain(
		behaviors,
	);
	expect(undemandedRuntimeModules({ demandMaps: [visible], moduleIds: ids })).not.toContain(
		behaviors,
	);
	expect(
		undemandedRuntimeModules({ demandMaps: [clickOnly, visible], moduleIds: ids }),
	).not.toContain(behaviors);
});

test('unlisted arm and row records defer only capabilities every map enumerates', () => {
	const capability = '/repo/packages/web/src/resume-behaviors.ts';
	const branch = {
		recordId: 'branch:b0',
		kind: 'branch' as const,
		runtimeModuleIds: ['web/resume-branches'],
	};
	const enumerated = demand({
		payloadRecords: [...demand().payloadRecords, branch],
		capabilityModuleIds: [],
		unknownRecordModuleIds: [
			...dispatch,
			'web/resume-branches',
			'web/dom-journal',
			'web/resume-behaviors',
		],
	});
	const ids = [...moduleIds, capability];
	// dom-journal is undemanded here but not a capability: an unlisted arm record could still need it.
	expect(undemandedRuntimeModules({ demandMaps: [enumerated], moduleIds: ids })).toEqual(
		new Set([capability]),
	);
	expect(
		undemandedRuntimeModules({
			demandMaps: [enumerated, demand({ capabilityModuleIds: ['web/resume-behaviors'] })],
			moduleIds: ids,
		}),
	).toEqual(new Set());
	expect(
		undemandedRuntimeModules({
			demandMaps: [enumerated, demand({ capabilityModuleIds: undefined })],
			moduleIds: ids,
		}),
	).toEqual(new Set());
});

test('a behavior or visible event inside an arm or row keeps the behavior runtime', async () => {
	const behaviors = '/repo/packages/web/src/resume-behaviors.ts';
	const asyncWiring = '/repo/packages/web/src/resume-async-wiring.ts';
	const compiled = async (body: string) =>
		(
			await compileTsrxModule({
				filename: '/workspace/src/Panel.tsrx',
				symbols: [],
				source: `import { computed, state } from '@markless/core';\nexport default function Panel() @{ let open = state(true); let items = state([{ id: 1 }]); let n = state(0); ${body} }`,
			})
		).runtimeDemandMaps.prerender;
	const toggle = `<button onClick={() => open = !open}>{n}</button>`;
	const armBehavior = await compiled(
		`<main>${toggle}@if (open) { <section attach={(host) => { host.dataset.on = 'y'; }}>on</section> }</main>`,
	);
	const rowBehavior = await compiled(
		`<ul>${toggle}@for (const item of items; key item.id) { <li attach={(host) => { host.dataset.id = String(item.id); }}>{item.id}</li> }</ul>`,
	);
	const armVisible = await compiled(
		`<main>${toggle}@if (open) { <p onVisible={() => n++}>seen</p> }</main>`,
	);
	const plain = await compiled(`<main>${toggle}@if (open) { <p>on</p> }</main>`);
	const armAsync = await compiled(
		`const data = computed(async ({ signal }) => { const r = await fetch('/x', { signal }); return await r.json(); }); <main>${toggle}@if (open) { @try { <p>{data.name}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> } }</main>`,
	);
	const ids = [...moduleIds, behaviors, asyncWiring];
	const plainUndemanded = undemandedRuntimeModules({ demandMaps: [plain], moduleIds: ids });
	expect(plainUndemanded).toContain(behaviors);
	expect(plainUndemanded).toContain(asyncWiring);
	for (const map of [armBehavior, rowBehavior, armVisible]) {
		const undemanded = undemandedRuntimeModules({ demandMaps: [plain, map], moduleIds: ids });
		expect(undemanded).not.toContain(behaviors);
		expect(undemanded).toContain(asyncWiring);
	}
	expect(
		undemandedRuntimeModules({ demandMaps: [plain, armAsync], moduleIds: ids }),
	).not.toContain(asyncWiring);
});
