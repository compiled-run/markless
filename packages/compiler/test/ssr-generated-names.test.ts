import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// The server render function wraps the authored component body, so every name it
// declares around that body is shadowed by, or collides with, a user binding of
// the same spelling. `const html = 'ltr'` in a router document used to fail the
// build with "Identifier 'html' has already been declared".

const generatedSpellings = [
	'html',
	'props',
	'child',
	'childProps',
	'output',
	'residue',
	'arm',
	'value',
	'tests',
	'match',
];

const pageSource = (name: string) => `
import { Badge } from './Badge.tsrx';

function Local({ label }: { label: string }) @{
	const ${name} = label + '!';
	<b data-local-child={${name}}>{${name}}</b>
}

export default function Page({ heading }: { heading: string }) @{
	const ${name} = 'value-of-' + heading;
	<main data-local={${name}}>
		<p>{${name}}</p>
		<Badge label={${name}} />
		<Local label={${name}} />
		@if (${name} === 'value-of-h') {
			<em>if-yes</em>
		} @else {
			<em>if-no</em>
		}
		@switch (${name}) {
			@case 'value-of-h': {
				<s>case-yes</s>
			}
			@default: {
				<s>case-no</s>
			}
		}
	</main>
}
`;

const wholePropsSource = `
import { Badge } from './Badge.tsrx';

export default function Page(props: { heading: string }) @{
	const html = props.heading + '-html';
	<main data-heading={props.heading}>
		<Badge label={html} />
	</main>
}
`;

type SsrRenderOutput = { readonly html: string };

async function renderPage(source: string, props: Record<string, unknown>) {
	const page = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(
		collectTsrxModuleDiagnostics(page).filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
	const received: Array<Record<string, unknown>> = [];
	const badge = {
		renderSsr: (badgeProps: Record<string, unknown>) => {
			received.push(badgeProps);
			return {
				html: `<i>${String(badgeProps.label)}</i>`,
				elementCount: 1,
				view: {
					locators: [],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
				},
			};
		},
	};
	const moduleSource = [
		`const payloadState = ${JSON.stringify(page.protocolState)};`,
		`const payloadView = ${JSON.stringify(page.protocolView)};`,
		page.publicRenderModule.renderDataModuleSource,
		page.publicRenderModule.ssrModuleSource
			.replace(
				/import (?:__marklessSsrComponent0|\{ [^}]+ as __marklessSsrComponent0 \}) from [^;]+;/,
				'const __marklessSsrComponent0 = globalThis.__marklessSsrGeneratedNamesBadge;',
			)
			.replace(
				/from (['"])@markless\/web\/fns\/([^'"]+)\1/g,
				(_match, _quote: string, helperModule: string) =>
					`from '${new URL(`../../web/src/fns/${helperModule}.ts`, import.meta.url).href}'`,
			),
		'export { marklessRenderSsr };',
	].join('\n');
	const scope = globalThis as { __marklessSsrGeneratedNamesBadge?: unknown };
	scope.__marklessSsrGeneratedNamesBadge = badge;
	try {
		const ssrModule = (await import(
			`data:text/javascript;charset=utf-8,${encodeURIComponent(moduleSource)}`
		)) as { marklessRenderSsr: (props: unknown) => Promise<SsrRenderOutput> };
		const output = await ssrModule.marklessRenderSsr(props);
		return { html: output.html, received };
	} finally {
		delete scope.__marklessSsrGeneratedNamesBadge;
	}
}

for (const name of generatedSpellings) {
	test(`a component-body local named \`${name}\` renders as the author wrote it`, async () => {
		const { html, received } = await renderPage(pageSource(name), { heading: 'h' });

		expect(html).toContain('data-local="value-of-h"');
		expect(html).toContain('<p>value-of-h</p>');
		expect(html).toContain('<i>value-of-h</i>');
		expect(html).toContain('<em>if-yes</em>');
		expect(html).toContain('<s>case-yes</s>');
		expect(html).toContain('<b data-local-child="value-of-h!">value-of-h!</b>');
		expect(received.map((badgeProps) => badgeProps.label)).toEqual(['value-of-h']);
	});
}

test('a whole-props parameter named `props` still reads the render props', async () => {
	const { html, received } = await renderPage(wholePropsSource, { heading: 'doc' });

	expect(html).toContain('data-heading="doc"');
	expect(received.map((badgeProps) => badgeProps.label)).toEqual(['doc-html']);
});
