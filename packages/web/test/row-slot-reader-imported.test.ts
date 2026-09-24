import { expect, test } from 'vitest';
import { marklessCsrRemapChildKeyedRepeat } from '../src/fns/composition.ts';
import { marklessRowSlotReader } from '../src/fns/row-slot-mint.ts';
import type { ResumeKeyedRepeatRecord, ResumeRenderDataThunk } from '../src/resume-types.ts';

/**
 * A keyed repeat authored in an IMPORTED component whose rows fill a slot with an
 * authored expression. The page's own surface does not declare that component, so
 * its reader is found through the import chain, and the ids it reads - spelled
 * the way its own module spells them - land on the composed instance's nodes.
 */
const childTemplate = {
	html: '<li><!--markless-slot:0--></li>',
	componentName: 'Chooser',
	textSlots: [
		{
			path: [0, 0],
			source: '`${mark}/${pick.label}`',
			reads: [{ graphNodeId: 'state:mark', path: [] }],
		},
	],
};

function surfaceWithImportedReader(read: (source: string, context: never) => unknown) {
	const chooser = { components: { Chooser: { readResidue: read } }, imports: {} };
	return {
		components: {
			Page: {
				edges: [
					{
						id: 'component-edge:0',
						childComponentName: 'Chooser',
						hostPrefix: 'c0:',
						symbolPrefix: 'c0:',
						props: [],
					},
					{
						id: 'component-edge:1',
						childComponentName: 'Chooser',
						hostPrefix: 'c1:',
						symbolPrefix: 'c1:',
						props: [],
					},
				],
			},
		},
		imports: { Chooser: chooser },
	};
}

function composedRepeat(instancePath: string): ResumeKeyedRepeatRecord {
	const mapped = marklessCsrRemapChildKeyedRepeat(
		{
			id: 'repeat:1',
			collectionGraphNodeId: 'state:picks',
			collectionPath: [],
			rowTemplate: childTemplate,
		},
		[],
		instancePath,
		instancePath,
	)!;
	return {
		id: `${instancePath}repeat:1`,
		parentHostNodeId: `${instancePath}h5`,
		collectionGraphNodeId: mapped.graphNodeId,
		collectionPath: mapped.path,
		keyPath: ['id'],
		itemName: 'pick',
		rowElementCount: 1,
		rowEvents: [],
		...(mapped.instancePath ? { instancePath: mapped.instancePath } : {}),
		...(mapped.rowTemplate ? { rowTemplate: mapped.rowTemplate } : {}),
	} as ResumeKeyedRepeatRecord;
}

test('composition keeps an expression-slot row template and spells its reads in the instance', () => {
	const repeat = composedRepeat('c1:');
	expect(repeat.collectionGraphNodeId).toBe('c1:state:picks');
	expect(repeat.rowTemplate).toEqual({
		...childTemplate,
		textSlots: [
			{ ...childTemplate.textSlots[0], reads: [{ graphNodeId: 'c1:state:mark', path: [] }] },
		],
	});
});

test('an imported component answers its rows through its own reader, in its instance ids', async () => {
	const surface = surfaceWithImportedReader((residue, context) => {
		const { read, repeatItem } = context as {
			read: (id: string) => unknown;
			repeatItem: { label: string };
		};
		expect(residue).toEqual({
			kind: 'authored-expression',
			source: childTemplate.textSlots[0]!.source,
		});
		return `${read('state:mark') as string}/${repeatItem.label}`;
	});
	const readIds: string[] = [];
	const graph = {
		read: (graphNodeId: string) => {
			readIds.push(graphNodeId);
			return graphNodeId === 'c1:state:mark' ? 'second' : 'first';
		},
	};
	const reader = await marklessRowSlotReader(
		(() => surface) as unknown as ResumeRenderDataThunk,
		composedRepeat('c1:'),
		graph,
	);
	expect(reader?.(childTemplate.textSlots[0]!.source, { label: 'Pear' }, 0)).toBe('second/Pear');
	expect(readIds).toEqual(['c1:state:mark']);
});

test('a row template naming a component no surface holds refuses instead of never rendering', async () => {
	const surface = { components: { Page: { edges: [] } }, imports: {} };
	await expect(
		Promise.resolve().then(() =>
			marklessRowSlotReader(
				(() => surface) as unknown as ResumeRenderDataThunk,
				composedRepeat('c0:'),
				{ read: () => undefined },
			),
		),
	).rejects.toMatchObject({ code: 'MARKLESS_REPEAT_ROW_SLOT_READER_MISSING' });
	expect(() =>
		marklessRowSlotReader(undefined, composedRepeat('c0:'), { read: () => undefined }),
	).toThrow('MARKLESS_REPEAT_ROW_SLOT_READER_MISSING');
});
