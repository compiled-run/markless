import { expect, test } from 'vitest';
import { materializeElementHandles } from '../src/resume-locators.ts';
import type { ResumeDomElement, ResumeRowRoot, ResumeViewRecord } from '../src/resume-types.ts';

// An array handle bound in keyed rows holds the rows its list's runtime has on screen, and nothing before that list is wired.

const element = (id: string): ResumeDomElement =>
	({ nodeType: 1, tagName: 'I', id, childNodes: [] }) as unknown as ResumeDomElement;

const repeat = {
	id: 'repeat:0',
	parentHostNodeId: 'h0',
	collectionGraphNodeId: 'state:tags',
	collectionPath: [],
	keyPath: [],
	itemName: 'tag',
	rowElementCount: 1,
	rowEvents: [],
	rowElementHandles: [{ hostPath: [], handleId: 'element:rows', name: 'rows', plural: true }],
} as unknown as NonNullable<ResumeViewRecord['keyedRepeats']>[number];

function handleOf(
	children: ReadonlyArray<ResumeDomElement>,
	onScreen?: () => ReadonlyArray<ResumeRowRoot>,
) {
	const parent = {
		nodeType: 1,
		tagName: 'SECTION',
		childNodes: children,
	} as unknown as ResumeDomElement;
	if (onScreen) parent.__marklessRepeatRows = new Map([[repeat.id, onScreen]]);
	const root = {
		nodeType: 1,
		tagName: 'MAIN',
		childNodes: [parent],
	} as unknown as ResumeDomElement;
	const ids = () =>
		(
			(materializeElementHandles(root, new Map([['h0', parent]]), [], [repeat]).get('rows') ??
				[]) as ResumeDomElement[]
		).map((member) => (member as unknown as { id: string }).id);
	return ids;
}

test('the handle holds exactly the rows the list has on screen, not the siblings beside them', () => {
	const [head, x, y, tail] = ['head', 'x', 'y', 'tail'].map(element);
	expect(handleOf([head!, x!, y!, tail!], () => [x!, y!])()).toEqual(['x', 'y']);
});

test('the handle follows the list as it changes', () => {
	const [x, y, z] = ['x', 'y', 'z'].map(element);
	let shown: ResumeDomElement[] = [x!, y!];
	const ids = handleOf([x!, y!, z!], () => shown);
	expect(ids()).toEqual(['x', 'y']);
	shown = [y!, z!];
	expect(ids()).toEqual(['y', 'z']);
});

test('before the list is wired the handle holds no rows', () => {
	const [x, tail] = ['x', 'tail'].map(element);
	expect(handleOf([x!, tail!])()).toEqual([]);
});
