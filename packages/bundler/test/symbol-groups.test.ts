import { expect, test } from 'vitest';
import { computeInteractionClosures } from '../src/build/interaction-closures.ts';
import {
	mergeSymbolModuleSources,
	planSymbolGroups,
	symbolGroupKey,
} from '../src/build/symbol-groups.ts';
import { symbolGroupVirtualModuleId, symbolVirtualModuleId } from '../src/source-module.ts';
import type { RuntimeDemandMapManifest } from '../src/types.ts';

const handler = (id: number, body: string, imports = '') =>
	`${imports}export function symbol_${id}_x(context) {\n\t${body}\n}\n`;

test('grouped symbols ship as one module that keeps every import and export they had', () => {
	const merged = mergeSymbolModuleSources([
		{
			symbolId: 'symbol:0',
			kind: 'event-handler',
			source: handler(
				0,
				'return open(context);',
				'import { open, close } from "./menu.ts";\n',
			),
		},
		{
			symbolId: 'symbol:1',
			kind: 'event-handler',
			source: handler(1, 'return close(context);', 'import { close } from "./menu.ts";\n'),
		},
		{
			symbolId: 'symbol:2',
			kind: 'event-handler',
			source: handler(
				2,
				'return toggle(context);',
				'import toggle, * as all from "./toggle.ts";\n',
			),
		},
	])!;
	expect(merged.symbolIds).toEqual(['symbol:0', 'symbol:1', 'symbol:2']);
	expect(merged.source).toContain('import { open, close } from "./menu.ts";');
	expect(merged.source).toContain('import toggle from "./toggle.ts";');
	expect(merged.source).toContain('import * as all from "./toggle.ts";');
	for (const id of [0, 1, 2])
		expect(merged.source).toContain(`export function symbol_${id}_x(context)`);
	expect(merged.source.match(/from "\.\/menu\.ts"/g)).toHaveLength(1);
});

test('a symbol whose names would clash with another member keeps its own module', () => {
	const merged = mergeSymbolModuleSources([
		{
			symbolId: 'symbol:0',
			kind: 'event-handler',
			source: `function step() { return 1; }\n${handler(0, 'return step();')}`,
		},
		{
			symbolId: 'symbol:1',
			kind: 'event-handler',
			source: `function step() { return 2; }\n${handler(1, 'return step();')}`,
		},
		{
			symbolId: 'symbol:2',
			kind: 'event-handler',
			source: handler(2, 'return step();', 'import { other as step } from "./steps.ts";\n'),
		},
		{ symbolId: 'symbol:3', kind: 'event-handler', source: handler(3, 'return 3;') },
	])!;
	expect(merged.symbolIds).toEqual(['symbol:0', 'symbol:3']);
	expect(merged.source).toContain('return 1;');
	expect(merged.source).not.toContain('return 2;');
});

test('a symbol with top-level code to run keeps its own module, so loading a group runs nothing else', () => {
	const merged = mergeSymbolModuleSources([
		{
			symbolId: 'symbol:0',
			kind: 'event-handler',
			source: `const table = build();\n${handler(0, 'return table;')}`,
		},
		{ symbolId: 'symbol:1', kind: 'event-handler', source: handler(1, 'return 1;') },
		{ symbolId: 'symbol:2', kind: 'event-handler', source: handler(2, 'return 2;') },
	])!;
	expect(merged.symbolIds).toEqual(['symbol:1', 'symbol:2']);
});

test('members that import different modules never share a group, so loading one sets up nothing extra', () => {
	const groups = planSymbolGroups(
		[
			{
				symbolId: 'symbol:0',
				kind: 'event-handler',
				source: handler(0, 'return a();', 'import { a } from "./a.ts";\n'),
			},
			{
				symbolId: 'symbol:1',
				kind: 'event-handler',
				source: handler(1, 'return b();', 'import { b } from "./b.ts";\n'),
			},
			{
				symbolId: 'symbol:2',
				kind: 'event-handler',
				source: handler(2, 'return a2();', 'import { a2 } from "./a.ts";\n'),
			},
		],
		() => 'same',
	);
	expect(groups.map((group) => group.symbolIds)).toEqual([['symbol:0', 'symbol:2']]);
});

test('only symbols the demand map cannot tell apart share a module, and statically imported kinds never do', () => {
	const demand = {
		version: 1,
		recordKinds: [],
		symbols: [],
		payloadRecords: [],
		actions: [
			{
				hostNodeId: 'h1',
				eventName: 'click',
				recordKind: 'event',
				recordKinds: ['event'],
				payloadRecordIds: [],
				runtimeModuleIds: [],
				firstUse: { symbolIds: ['symbol:0', 'symbol:1'], runtimeModuleIds: [] },
			},
		],
		unknownRecordModuleIds: [],
		firstUsePage: {
			resume: { symbolIds: ['symbol:4'], runtimeModuleIds: [] },
			pageSpaceReaders: [],
			passedProps: [],
			callbackSlots: [],
		},
	} satisfies RuntimeDemandMapManifest;
	const member = (id: number, kind: string) => ({
		symbolId: `symbol:${id}`,
		kind,
		source: handler(id, `return ${id};`),
	});
	const groups = planSymbolGroups(
		[
			member(0, 'event-handler'),
			member(1, 'event-handler'),
			member(2, 'event-handler'),
			member(3, 'event-handler'),
			member(4, 'event-handler'),
			member(5, 'sync-computed-derive'),
			member(6, 'sync-computed-derive'),
			member(7, 'dom-update'),
		],
		(entry) => symbolGroupKey(entry.symbolId, entry.kind, demand),
	);
	expect(groups.map((group) => group.symbolIds)).toEqual([
		['symbol:0', 'symbol:1'],
		['symbol:2', 'symbol:3'],
	]);
});

function routeClosures(actions: Array<[host: string, symbolIds: string[]]>) {
	const file = '/app/menu.tsrx';
	const map = {
		version: 1,
		recordKinds: [],
		symbols: [],
		payloadRecords: [],
		actions: actions.map(([host, symbolIds]) => ({
			hostNodeId: host,
			eventName: 'click',
			recordKind: 'event' as const,
			recordKinds: ['event' as const],
			payloadRecordIds: [],
			runtimeModuleIds: [],
			firstUse: { symbolIds, runtimeModuleIds: [] },
		})),
		unknownRecordModuleIds: [],
		firstUsePage: {
			resume: { symbolIds: [], runtimeModuleIds: [] },
			pageSpaceReaders: [],
			passedProps: [],
			callbackSlots: [],
		},
	} satisfies RuntimeDemandMapManifest;
	const group = `\0${symbolGroupVirtualModuleId(file, 'group:menu')}`;
	const lone = `\0${symbolVirtualModuleId(file, 'symbol:2')}`;
	const [route] = computeInteractionClosures({
		root: '/app',
		modules: new Map([
			[`${file}?markless-resume`, { dependencies: [], source: file }],
			[group, { dependencies: [], source: file }],
			[lone, { dependencies: [], source: file }],
		]),
		routes: new Map([['menu.tsrx', [`${file}?markless-resume`]]]),
		demand: [
			{
				source: `${file}?markless-resume`,
				map,
				symbolGroups: new Map([
					['symbol:0', 'group:menu'],
					['symbol:1', 'group:menu'],
				]),
			},
		],
	});
	const closureOf = (host: string) =>
		route!.consumers.find((consumer) => consumer.key.endsWith(`#${host}:click`))!.modules;
	return { group, lone, closureOf };
}

test('a group stays first-use code when the page names every member before input, across its controls', () => {
	const { group, closureOf } = routeClosures([
		['h1', ['symbol:0']],
		['h2', ['symbol:1']],
	]);
	expect(closureOf('h1')).toContain(group);
	expect(closureOf('h2')).toContain(group);
});

test('a group some member of which nothing on the page names before input loads on first use instead', () => {
	const { group, lone, closureOf } = routeClosures([
		['h1', ['symbol:0']],
		['h3', ['symbol:2']],
	]);
	expect(closureOf('h1')).not.toContain(group);
	expect(closureOf('h3')).toContain(lone);
});
