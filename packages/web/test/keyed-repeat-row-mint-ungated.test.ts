import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { wireKeyedRepeats } from '../src/resume-keyed-repeats.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../src/resume-types.ts';

/**
 * What a repeat that CAN build does when nothing hands it the building half.
 *
 * The mint's module specifier is written by the compiled app, not by the repeat
 * runtime, so a build the compiler recorded no mintable repeat for installs no
 * `__marklessRowMint` at all. That page must behave exactly like a page whose
 * record carries no `rowTemplate`: the list stays as served, silently, because
 * half a row is worse than none. This file installs no loader - hence its own
 * file, since the runtime holds one module-scoped mint per module instance and a
 * sibling test that installed one would answer for this one too.
 */

type Node = {
	nodeType: number;
	tagName?: string;
	data?: string;
	childNodes: Node[];
	parentElement?: Node | null;
	insertBefore?: (node: Node, before: Node | null) => unknown;
	removeChild?: (node: Node) => unknown;
	ownerDocument?: unknown;
};

function el(tagName: string, children: Node[] = []): Node {
	const node: Node = { nodeType: 1, tagName, childNodes: children };
	for (const child of children) child.parentElement = node;
	node.insertBefore = (fresh, before) => {
		const held = node.childNodes.indexOf(fresh);
		if (held >= 0) node.childNodes.splice(held, 1);
		const at = before ? node.childNodes.indexOf(before) : -1;
		if (at >= 0) node.childNodes.splice(at, 0, fresh);
		else node.childNodes.push(fresh);
		fresh.parentElement = node;
		return fresh;
	};
	node.removeChild = (gone) => {
		const at = node.childNodes.indexOf(gone);
		if (at >= 0) node.childNodes.splice(at, 1);
		gone.parentElement = null;
		return gone;
	};
	return node;
}

function txt(data: string): Node {
	return { nodeType: 3, data, childNodes: [] };
}

function textOf(node: Node): string {
	return node.nodeType === 3 ? (node.data ?? '') : node.childNodes.map(textOf).join('');
}

test('a page handed no mint loader leaves an unserved key unrendered', async () => {
	expect(
		(globalThis as { __marklessRowMint?: unknown }).__marklessRowMint,
		'this file proves the ungated path, so nothing may have installed a loader',
	).toBeUndefined();

	const rows = [el('LI', [txt('alpha')]), el('LI', [txt('bravo')])];
	const list = el('UL', rows);
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:rows',
				value: [
					{ id: 'a', label: 'alpha' },
					{ id: 'b', label: 'bravo' },
				],
			},
		],
	});
	const view = {
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		keyedRepeats: [
			{
				id: 'repeat:0',
				parentHostNodeId: 'h0',
				collectionGraphNodeId: 'state:rows',
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'row',
				rowElementCount: 2,
				// The record CAN build - this is the mintable shape, and the only thing
				// missing is the module the app never wrote a specifier for.
				rowTemplate: { html: '<li><b>x</b></li>', textSlots: [] },
				rowEvents: [],
			},
		],
	} as unknown as ResumeViewRecord;

	let release: (() => void) | undefined;
	wireKeyedRepeats({
		graph,
		view,
		elementsByHostId: new Map<string, ResumeDomElement>([
			['h0', list as unknown as ResumeDomElement],
		]),
		events: { addRowEvent: () => undefined } as never,
		storeContainerSubscription: (stop: () => void) => (release = stop),
	});

	graph.write({
		graphNodeId: 'state:rows',
		value: [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
			{ id: 'c', label: 'charlie' },
		],
	});
	await graph.flush();

	// No throw, no half-row, and the served rows are untouched.
	expect(list.childNodes.map(textOf)).toEqual(['alpha', 'bravo']);
	release?.();
});
