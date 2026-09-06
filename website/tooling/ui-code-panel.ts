import {
	ColourTable,
	DocRegistry,
	RUN_TYPES,
	docsMarkup,
	highlightHtml,
	paneLines,
	runMarkup,
} from './ui-code-runs.ts';
import { CODE_CSS, CODE_PANEL_CSS, docRules } from './ui-playground-css.ts';
import { GENERATED_DIR, codePanelChrome, identifier, type ChromePane } from './ui-playground.ts';

function paneMarkup(list: string, indent: string): string {
	return `${indent}@for (const line of ${list}; key line.id) {
${indent}	<span class="pg-line">
${runMarkup(`${indent}\t\t`)}
${indent}	</span>
${indent}}`;
}

/** Where the generated module for one demo's code panel is written. */
export function codePanelPath(root: string, family: string, stem: string): string {
	return `${root.replace(/\/$/, '')}/${GENERATED_DIR}/${family}__${stem}__code.tsrx`;
}

export function codePanelName(family: string, stem: string): string {
	return `${identifier(family)}${identifier(stem)}Code`;
}

/** Where the generated module for one demo's example card is written. */
export function examplePath(root: string, family: string, stem: string): string {
	return `${root.replace(/\/$/, '')}/${GENERATED_DIR}/${family}__${stem}__example.tsrx`;
}

export function exampleName(family: string, stem: string): string {
	return `${identifier(family)}${identifier(stem)}Example`;
}

/** One file of the demo, as the panel shows it. */
export type PanelPane = {
	readonly value: string;
	/** What the tab strip shows — the file's own name. */
	readonly label: string;
	readonly code: string;
	readonly language: string;
};

/**
 * The whole generated module: the run tables, the chrome, the doc registry, the
 * CSS. With `demo` the card is an example: the demo component on a stage above
 * the code that made it.
 */
export async function codePanelModule(input: {
	readonly family: string;
	readonly stem: string;
	readonly panes: readonly PanelPane[];
	/** The demo module, as the generated file imports it. Absent for a bare code panel. */
	readonly demo?: string;
}): Promise<string> {
	const name =
		input.demo === undefined
			? codePanelName(input.family, input.stem)
			: exampleName(input.family, input.stem);
	const registry = new DocRegistry(
		`${input.demo === undefined ? 'cp' : 'ex'}-${input.family}-${input.stem}`,
	);
	const colours = new ColourTable();
	const consts: string[] = [];
	const panes: ChromePane[] = [];
	for (const pane of input.panes) {
		const list = `${pane.value}Lines`;
		const lines = paneLines(await highlightHtml(pane.code, pane.language), registry, colours);
		consts.push(`const ${list}: readonly Line[] = ${JSON.stringify(lines)};`);
		panes.push({
			value: pane.value,
			label: pane.label,
			markup: paneMarkup(list, '\t\t\t\t\t\t\t\t\t'),
		});
	}
	const chrome = codePanelChrome({
		scenario: `${input.family}/${input.stem}`,
		panes,
		indent: '\t\t\t',
	});
	const imports = ["import { collapsible, lucide, tabs } from '@markless/ui';"];
	if (input.demo !== undefined) imports.push(`import Demo from ${JSON.stringify(input.demo)};`);
	const stage =
		input.demo === undefined ? '' : `\t\t<div class="pg-stage">\n\t\t\t<Demo />\n\t\t</div>\n`;
	return `${imports.join('\n')}

${RUN_TYPES}

${consts.join('\n')}
const docs: readonly Doc[] = ${JSON.stringify(registry.docs)};

export default function ${name}() @{
	<div class="cp" data-family="${input.family}">
${stage}		<div class="pg-code">
${chrome}
		</div>
${docsMarkup('\t\t')}
		<style>
${CODE_CSS}

${CODE_PANEL_CSS}

${colours.css()}

${docRules(
	registry.docs.map((doc) => doc.n),
	'.cp',
)}
		</style>
	</div>
}
`;
}
