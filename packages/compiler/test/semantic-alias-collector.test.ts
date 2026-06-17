import { expect, test } from 'vitest';
import type { AnyNode } from '../src/ast/nodes.ts';
import { collectDestructuredAliases } from '../src/passes/semantic-graph/collect-aliases.ts';
import {
	createMutableSemanticGraphArtifact,
	createWalkState,
} from '../src/passes/semantic-graph/types.ts';

test('alias collector records destructured graph aliases and rest exclusions', () => {
	const source = 'const { title: menuTitle, meta: { label: menuLabel }, ...menuRest } = menu;';
	const menuTitleStart = source.indexOf('menuTitle');
	const menuLabelStart = source.indexOf('menuLabel');
	const menuRestStart = source.indexOf('menuRest');
	const initStart = source.lastIndexOf('menu');
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	graph.graphBindings.push({
		id: 'state:menu',
		name: 'menu',
		kind: 'state',
		writable: true,
	});
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
	});
	const pattern = {
		type: 'ObjectPattern',
		properties: [
			{
				type: 'Property',
				key: { type: 'Identifier', name: 'title' },
				value: {
					type: 'Identifier',
					name: 'menuTitle',
					start: menuTitleStart,
					end: menuTitleStart + 'menuTitle'.length,
				},
			},
			{
				type: 'Property',
				key: { type: 'Identifier', name: 'meta' },
				value: {
					type: 'ObjectPattern',
					properties: [
						{
							type: 'Property',
							key: { type: 'Identifier', name: 'label' },
							value: {
								type: 'Identifier',
								name: 'menuLabel',
								start: menuLabelStart,
								end: menuLabelStart + 'menuLabel'.length,
							},
						},
					],
				},
			},
			{
				type: 'RestElement',
				argument: {
					type: 'Identifier',
					name: 'menuRest',
					start: menuRestStart,
					end: menuRestStart + 'menuRest'.length,
				},
			},
		],
	} satisfies AnyNode;
	const init = {
		type: 'Identifier',
		start: initStart,
		end: initStart + 'menu'.length,
		name: 'menu',
	} satisfies AnyNode;

	collectDestructuredAliases(pattern, init, 'const', state);

	expect(graph.aliases).toEqual([
		expect.objectContaining({
			name: 'menuTitle',
			target: 'menu.title',
			declarationKind: 'const',
		}),
		expect.objectContaining({
			name: 'menuLabel',
			target: 'menu.meta.label',
			declarationKind: 'const',
		}),
		expect.objectContaining({
			name: 'menuRest',
			target: 'menu',
			declarationKind: 'const',
			excludedPaths: [['title'], ['meta']],
		}),
	]);
});

test('alias collector records array destructured graph aliases', () => {
	const source = 'let [firstItem, secondItem] = items;';
	const firstItemStart = source.indexOf('firstItem');
	const secondItemStart = source.indexOf('secondItem');
	const initStart = source.lastIndexOf('items');
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	graph.graphBindings.push({
		id: 'state:items',
		name: 'items',
		kind: 'state',
		writable: true,
	});
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
	});
	const pattern = {
		type: 'ArrayPattern',
		elements: [
			{
				type: 'Identifier',
				name: 'firstItem',
				start: firstItemStart,
				end: firstItemStart + 'firstItem'.length,
			},
			{
				type: 'Identifier',
				name: 'secondItem',
				start: secondItemStart,
				end: secondItemStart + 'secondItem'.length,
			},
		],
	} satisfies AnyNode;
	const init = {
		type: 'Identifier',
		start: initStart,
		end: initStart + 'items'.length,
		name: 'items',
	} satisfies AnyNode;

	collectDestructuredAliases(pattern, init, 'let', state);

	expect(graph.aliases).toEqual([
		expect.objectContaining({
			name: 'firstItem',
			target: 'items.0',
			declarationKind: 'let',
		}),
		expect.objectContaining({
			name: 'secondItem',
			target: 'items.1',
			declarationKind: 'let',
		}),
	]);
});

test('alias collector reports graph destructuring defaults instead of dropping fallback semantics', () => {
	const source = 'const { title: menuTitle = "Untitled" } = menu;';
	const menuTitleStart = source.indexOf('menuTitle');
	const defaultStart = source.indexOf('menuTitle = "Untitled"');
	const initStart = source.lastIndexOf('menu');
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	graph.graphBindings.push({
		id: 'state:menu',
		name: 'menu',
		kind: 'state',
		writable: true,
	});
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
	});
	const pattern = {
		type: 'ObjectPattern',
		properties: [
			{
				type: 'Property',
				key: { type: 'Identifier', name: 'title' },
				value: {
					type: 'AssignmentPattern',
					start: defaultStart,
					end: defaultStart + 'menuTitle = "Untitled"'.length,
					left: {
						type: 'Identifier',
						name: 'menuTitle',
						start: menuTitleStart,
						end: menuTitleStart + 'menuTitle'.length,
					},
					right: { type: 'Literal', value: 'Untitled' },
				},
			},
		],
	} satisfies AnyNode;
	const init = {
		type: 'Identifier',
		start: initStart,
		end: initStart + 'menu'.length,
		name: 'menu',
	} satisfies AnyNode;

	collectDestructuredAliases(pattern, init, 'const', state);

	expect(graph.aliases).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'ARCADE_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Graph destructuring defaults are not supported yet',
			message:
				'Cannot create graph alias "menuTitle" from "menu.title" with a default value.',
			why: 'A destructuring default must run only when the property value is undefined. The current graph alias artifact can represent a graph path, but not a fallback expression without changing JavaScript semantics.',
			primarySpan: {
				filename: 'src/App.tsrx',
				start: defaultStart,
				end: defaultStart + 'menuTitle = "Untitled"'.length,
			},
			statePath: 'menu.title',
			source: 'menuTitle = "Untitled"',
			docsUrl: 'https://arcadejs.com/errors/ARCADE_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED',
		}),
	]);
});
