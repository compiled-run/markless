import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { renderPrerenderDataSurface } from '../../web/src/prerender/evaluator.ts';

test.each([
	{ name: 'Badge', prop: 'caption', first: 'label', second: 'hidden', tag: 'img' },
	{ name: 'Panel', prop: 'description', first: 'text', second: 'quiet', tag: 'section' },
])(
	'client residue preserves $name local dependencies per render',
	async ({ name, prop, first, second, tag }) => {
		const result = await compileTsrxModule({
			filename: `src/${name}.tsrx`,
			source: `export function ${name}({ ${prop}, format }) @{
	const ${first} = format(${prop} ?? '');
	const ${second} = ${first} === '' ? 'true' : 'false';
	<${tag} title={${first}} aria-hidden={${second}} />
}`,
			symbols: [],
		});
		const source = result.publicRenderModule.componentDefinitions.find(
			(def) => def.name === name,
		)?.residueReaderSource;
		expect(typeof source).toBe('string');
		const reader = new Function(`return (${source});`)();
		let calls = 0;
		const props: Record<string, unknown> = {
			[prop]: 'Ready',
			format: (text: string) => {
				calls++;
				return text;
			},
		};
		const context = { read: (key: string) => props[key.slice(5)] };
		expect(reader({ source: first }, context)).toBe('Ready');
		expect(reader({ source: second }, context)).toBe('false');
		expect(calls).toBe(1);
		const another = {
			read: (key: string) => (key === `prop:${prop}` ? '' : props[key.slice(5)]),
		};
		expect(reader({ source: second }, another)).toBe('true');
		expect(calls).toBe(2);
	},
);

test('client render evaluates local and nested repeat collections', async () => {
	const result = await compileTsrxModule({
		filename: '/groups.tsrx',
		source: `export function Groups({ groups }) @{
			const sections = groups.map(group => ({ ...group, title: group.title.toUpperCase() }));
			<section>@for (const section of sections; key section.title) {
				<div><h2>{section.title}</h2>@for (const entry of section.entries; key entry) {<b>{entry}</b>}</div>
			}</section>
		}`,
		symbols: [],
	});
	const definition = result.publicRenderModule.componentDefinitions.find(
		(definition) => definition.name === 'Groups',
	)!;
	const surface = {
		rootComponentName: 'Groups',
		renderData: result.renderData,
		components: {
			Groups: {
				...definition,
				readResidue: definition.residueReaderSource
					? new Function(`return (${definition.residueReaderSource})`)()
					: undefined,
			},
		},
		imports: {},
	};
	const rendered = await renderPrerenderDataSurface(surface as never, async () => undefined, {
		groups: [
			{ title: 'first', entries: ['Alpha', 'Beta'] },
			{ title: 'next', entries: ['Gamma'] },
		],
	});
	for (const text of ['FIRST', 'Alpha', 'Beta', 'NEXT', 'Gamma'])
		expect(rendered.html).toContain(text);
});

test.each([
	{ component: 'Panel', property: 'id', tag: 'p' },
	{ component: 'Card', property: 'caption', tag: 'aside' },
])(
	'client $component state initializers share component-local derived objects',
	async ({ component, property, tag }) => {
		const result = await compileTsrxModule({
			filename: '/state-local.tsrx',
			source: `import { state } from '@markless/core';
		export function ${component}({ label, format }) @{
			const model = { selected: { ${property}: format(label) } };
			let selection = state({ ${property}: model.selected.${property} });
			let copy = state(model.selected.${property});
			const summary = selection.${property} + '!';
			<${tag} title={summary}>{selection.${property}} {copy}</${tag}>
		}`,
			symbols: [],
		});
		const definition = result.publicRenderModule.componentDefinitions.find(
			(definition) => definition.name === component,
		)!;
		const surface = {
			rootComponentName: component,
			renderData: result.renderData,
			components: {
				[component]: {
					...definition,
					readResidue: definition.residueReaderSource
						? new Function(`return (${definition.residueReaderSource})`)()
						: undefined,
				},
			},
			imports: {},
		};
		let calls = 0;
		const rendered = await renderPrerenderDataSurface(
			surface as never,
			async (id) => {
				const module = result.symbolModules.modules.find(
					(module) => module.symbolId === id,
				)!;
				return new Function(
					`${module.source.replace(/export /g, '')}; return ${module.exportName};`,
				)();
			},
			{
				label: 'ready',
				format: (label: string) => {
					calls++;
					return label.toUpperCase();
				},
			},
		);
		expect(rendered.html).toContain('READY');
		expect(rendered.html).toContain('title="READY!"');
		expect(calls).toBe(1);
	},
);
