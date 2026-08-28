import type { RuntimeGraph } from '@markless/runtime';
import { beforeAll, expect, test } from 'vitest';
import {
	installMarklessComposedArmRecords,
	marklessInstanceScopedElementHandle,
} from '../../src/fns/instance-scope.ts';
import { materializeElementHandles } from '../../src/resume-locators.ts';
import type { ResumeDomElement } from '../../src/resume-types.ts';

// A handle bound inside a flippable `@if` arm is filed at resume from the arm
// record, which the serializer left in module space. These pin the two halves
// that make such a handle one element per RENDERED widget: the branch id names
// the instance at registration, and a reader whose instance is named asks the
// qualified key alone.

const WIDGET = 'shared:/src/widget.tsrx#widgetState';
const PANEL = `${WIDGET}/element:panelEl`;

// Only a composing page installs the qualifier, exactly as the runtime does.
beforeAll(() => installMarklessComposedArmRecords());

function element(tagName = 'DIV'): ResumeDomElement {
	return { nodeType: 1, tagName, childNodes: [] } as unknown as ResumeDomElement;
}

function pageOf(instancePaths: ReadonlyArray<string>) {
	const panels = instancePaths.map(() => element());
	const root = { nodeType: 1, tagName: 'MAIN', childNodes: panels } as unknown as ResumeDomElement;
	const graph = {
		listSharedDefinitions: () =>
			instancePaths.map((path) => ({ id: path + WIDGET, scope: 'widget' })),
	} as unknown as RuntimeGraph;
	const handles = materializeElementHandles(root, new Map(), [], []);
	instancePaths.forEach((path, index) =>
		handles.register(
			`branch:${path}branch-site:0:arm:0:${index}`,
			{ handleId: PANEL, name: 'panelEl' },
			panels[index]!,
			`${path}branch-site:0`,
			graph,
		),
	);
	return { panels, graph, handles };
}

test('an arm files its handle under the instance the branch belongs to', () => {
	const { panels, handles } = pageOf(['c0:', 'c1:']);
	expect(handles.get(`c0:${PANEL}`)).toBe(panels[0]);
	expect(handles.get(`c1:${PANEL}`)).toBe(panels[1]);
});

// The id as compiled still names both instances, which is why the reader below
// must never ask it: two rendered widgets under one key is the loud refusal.
test('the id exactly as compiled names every instance and refuses to answer', () => {
	const { handles } = pageOf(['c0:', 'c1:']);
	expect(() => handles.get(PANEL)).toThrow(/MARKLESS_ELEMENT_HANDLE_AMBIGUOUS|two|2/i);
});

test('a reader whose instance is named reads its own arm element, never the page-wide one', () => {
	const { panels, graph, handles } = pageOf(['c0:', 'c1:']);
	expect(marklessInstanceScopedElementHandle(handles.get, 'c0:', graph)(PANEL)).toBe(panels[0]);
	expect(marklessInstanceScopedElementHandle(handles.get, 'c1:', graph)(PANEL)).toBe(panels[1]);
});

// A single-instance page has one answer under both keys, so the removal of the
// page-wide fallback cannot be what makes the reader above pass.
test('a lone instance answers through its qualified key, not through the compiled id', () => {
	const { panels, graph, handles } = pageOf(['c0:']);
	expect(handles.get(`c0:${PANEL}`)).toBe(panels[0]);
	expect(marklessInstanceScopedElementHandle(handles.get, 'c0:', graph)(PANEL)).toBe(panels[0]);
});

// Presence follows the arm: the qualified key is filed by the same call that
// files the compiled id, so unfiling the host has to take both.
test('unfiling the arm host takes the qualified key with it', () => {
	const { graph, handles } = pageOf(['c0:', 'c1:']);
	handles.deleteHost('branch:c0:branch-site:0:arm:0:0');
	expect(handles.get(`c0:${PANEL}`)).toBeUndefined();
	expect(marklessInstanceScopedElementHandle(handles.get, 'c0:', graph)(PANEL)).toBeUndefined();
	expect(handles.get(`c1:${PANEL}`)).toBeDefined();
});

// A handle no rendered widget owns - a bare name, a component-local id, a
// page-scoped shared() graph - is page space by design and keeps the direct read.
test('an id no rendered widget owns is still read exactly as compiled', () => {
	const { panels, graph, handles } = pageOf(['c0:']);
	expect(marklessInstanceScopedElementHandle(handles.get, 'c0:', graph)('panelEl')).toBe(
		panels[0],
	);
});
