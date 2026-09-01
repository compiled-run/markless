// The playground a family page shows is generated, never written by hand: the
// authored demo `components/demos/ui/<family>/<scenario>.tsrx` is parsed, the
// manifest and `ui-meta/<family>.ts` supply the control model, and this module
// emits one TSRX component holding the chrome, the demo and the code panel.
//
// Everything lands in ONE module and ONE island on purpose. A control cell that
// crossed a module boundary would need a foreign `state()` or a cross-module
// callback, and neither survives resume.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
	controlFor,
	initialValue,
	type ControlDescriptor,
} from '../components/docs/api-derive/control-kind.ts';
import type { FamilyMeta, FamilyPreset, PropRef } from '../components/docs/ui-meta/index.ts';
import type { CodeLine, CodeToken } from './ui-demos.ts';

/**
 * The generated module is written to disk rather than served from a virtual id:
 * a family island whose module has no file behind it resumes without a symbol
 * loader (`loadSymbol is not a function` on the first control write), so the
 * whole graph — compiler, symbol modules, resume — sees an ordinary .tsrx file.
 */
export const GENERATED_DIR = 'components/docs/playground/generated';

/** Where the generated module for one demo is written. */
export function generatedPath(root: string, family: string, stem: string): string {
	return `${root.replace(/\/$/, '')}/${GENERATED_DIR}/${family}__${stem}.tsrx`;
}

// --- the house parser -------------------------------------------------------

type AstNode = { type: string; start: number; end: number; [key: string]: unknown };

type ParseModule = (source: string, filename: string) => AstNode & { body: AstNode[] };

let parser: ParseModule | undefined;

/**
 * yuku is the compiler's declared dependency and not this site's, so the parser
 * is reached through the package that owns it — the same route
 * `packages/headless/components/api-extract/analyzer.ts` takes. `@markless/compiler`
 * is a pnpm override here rather than a direct dependency, so the walk starts at
 * `@markless/core`, which does declare it.
 */
async function houseParser(): Promise<ParseModule> {
	if (parser) return parser;
	const fromHere = createRequire(import.meta.url);
	const compiler = createRequire(fromHere.resolve('@markless/core')).resolve('@markless/compiler');
	const loaded = (await import(pathToFileURL(compiler).href)) as {
		parseJavaScriptModule?: ParseModule;
	};
	if (typeof loaded.parseJavaScriptModule !== 'function')
		throw new Error(
			'ui-playground: the vendored @markless/compiler exposes no module parser, so a demo cannot be analysed.',
		);
	parser = loaded.parseJavaScriptModule;
	return parser;
}

function isNode(value: unknown): value is AstNode {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as AstNode).type === 'string' &&
		typeof (value as AstNode).start === 'number'
	);
}

function children(node: AstNode): AstNode[] {
	const found: AstNode[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === 'type' || key === 'start' || key === 'end') continue;
		if (isNode(value)) found.push(value);
		else if (Array.isArray(value)) for (const item of value) if (isNode(item)) found.push(item);
	}
	return found;
}

function jsxName(node: AstNode): string {
	if (node.type === 'JSXMemberExpression')
		return `${jsxName(node.object as AstNode)}.${jsxName(node.property as AstNode)}`;
	return String((node as { name?: unknown }).name ?? '');
}

// --- what the analysis answers ---------------------------------------------

/** One attribute written on the demo's family root. */
export type RootAttribute = {
	readonly name: string;
	/** The attribute itself, `value="ship"` included. */
	readonly start: number;
	readonly end: number;
	/** The value expression: what is inside the quotes, or inside the braces. */
	readonly valueStart?: number;
	readonly valueEnd?: number;
	/** The value read back, when it is a literal the build can see. */
	readonly literal?: string | number | boolean;
	/** The value expression verbatim, for an authored handler the wrapper calls. */
	readonly expression?: string;
};

export type DemoAnalysis = {
	readonly family: string;
	readonly stem: string;
	readonly file: string;
	readonly source: string;
	/** `accordion.root`. */
	readonly tag: string;
	readonly openingStart: number;
	readonly openingEnd: number;
	readonly selfClosing: boolean;
	readonly childrenStart: number;
	readonly childrenEnd: number;
	readonly closing: string;
	readonly attributes: readonly RootAttribute[];
	/** The `<style>` element's span, absent when the demo has none. */
	readonly styleStart?: number;
	readonly styleEnd?: number;
	readonly css: string;
	/** Literal `value=` on the family's own parts below the root: a closed option set. */
	readonly itemValues: readonly string[];
};

function literalOf(node: AstNode | null | undefined): string | number | boolean | undefined {
	if (!node) return undefined;
	if (node.type !== 'Literal') return undefined;
	const value = (node as { value?: unknown }).value;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
		return value;
	return undefined;
}

function attributeOf(source: string, node: AstNode): RootAttribute {
	const name = jsxName(node.name as AstNode);
	const value = (node as { value?: AstNode | null }).value ?? null;
	// A bare `multiple` is `multiple={true}` and carries no span to slot into.
	if (value === null) return { name, start: node.start, end: node.end, literal: true };
	if (value.type === 'JSXExpressionContainer') {
		const expression = value.expression as AstNode;
		return {
			name,
			start: node.start,
			end: node.end,
			valueStart: expression.start,
			valueEnd: expression.end,
			literal: literalOf(expression),
			expression: source.slice(expression.start, expression.end),
		};
	}
	return {
		name,
		start: node.start,
		end: node.end,
		valueStart: value.start + 1,
		valueEnd: value.end - 1,
		literal: literalOf(value),
		expression: source.slice(value.start, value.end),
	};
}

/** Drops the common leading indentation a `<style>` block carries. */
function dedent(css: string): string {
	const lines = css.split('\n');
	let indent = Number.POSITIVE_INFINITY;
	for (const line of lines) {
		if (line.trim() === '') continue;
		indent = Math.min(indent, line.length - line.trimStart().length);
	}
	if (!Number.isFinite(indent) || indent === 0) return css.trim();
	return lines
		.map((line) => line.slice(indent))
		.join('\n')
		.trim();
}

/**
 * Reads one authored demo: which family it roots, what the root is given, and
 * where its CSS lives. Nothing here knows about the playground — it answers
 * questions about consumer code.
 */
export async function analyzeDemo(family: string, stem: string, file: string): Promise<DemoAnalysis> {
	const parse = await houseParser();
	const source = readFileSync(file, 'utf8');
	const program = parse(source, `${stem}.tsrx`);
	const exported = program.body.find((node) => node.type === 'ExportDefaultDeclaration');
	if (!exported)
		throw new Error(`ui-playground: ${file} has no default-exported component to build on.`);
	const declaration = (exported as { declaration?: AstNode }).declaration;
	const block = declaration ? (declaration as { body?: AstNode }).body : undefined;
	const root = block ? ((block as { render?: AstNode }).render ?? undefined) : undefined;
	if (!root || root.type !== 'JSXElement')
		throw new Error(
			`ui-playground: ${file} does not render a single element, so it cannot host a playground.`,
		);

	const opening = root.openingElement as AstNode;
	const tag = jsxName(opening.name as AstNode);
	if (!tag.startsWith(`${family}.`))
		throw new Error(
			`ui-playground: ${file} roots '${tag}', not a '${family}.*' part; a playground is generated from the family's own root.`,
		);

	const attributes = ((opening.attributes as AstNode[]) ?? [])
		.filter((node) => node.type === 'JSXAttribute')
		.map((node) => attributeOf(source, node));

	const kids = ((root as { children?: AstNode[] }).children ?? []) as AstNode[];
	const style = kids.find((node) => node.type === 'JSXStyleElement');
	const closingNode = (root as { closingElement?: AstNode }).closingElement;

	const itemValues: string[] = [];
	const walk = (node: AstNode) => {
		if (node.type === 'JSXElement' && node !== root) {
			const name = jsxName((node.openingElement as AstNode).name as AstNode);
			if (name.startsWith(`${family}.`)) {
				for (const attribute of ((node.openingElement as AstNode).attributes as AstNode[]) ?? []) {
					if (attribute.type !== 'JSXAttribute') continue;
					const read = attributeOf(source, attribute);
					if (read.name === 'value' && typeof read.literal === 'string' && !itemValues.includes(read.literal))
						itemValues.push(read.literal);
				}
			}
		}
		for (const child of children(node)) walk(child);
	};
	walk(root);

	const css =
		style === undefined
			? ''
			: dedent(
					source
						.slice(style.start, style.end)
						.replace(/^[^>]*>/, '')
						.replace(/<\/style>$/, ''),
				);

	return {
		family,
		stem,
		file,
		source,
		tag,
		openingStart: opening.start,
		openingEnd: opening.end,
		selfClosing: (opening as { selfClosing?: boolean }).selfClosing === true,
		childrenStart: opening.end,
		childrenEnd: closingNode ? closingNode.start : root.end,
		closing: closingNode ? source.slice(closingNode.start, closingNode.end) : '',
		attributes,
		styleStart: style?.start,
		styleEnd: style?.end,
		css,
		itemValues,
	};
}

// --- the control model ------------------------------------------------------

/** One control the generated chrome draws, and the cells it writes. */
export type PlaygroundControl = {
	readonly part: string;
	readonly prop: string;
	readonly kind: 'toggle' | 'select' | 'textbox' | 'event';
	/** The prop's type text, shown in the control's info tip. */
	readonly type: string;
	readonly options: readonly string[];
	/** `cMultiple` — the cell the demo's prop reads. */
	readonly cell: string;
	/** `tMultiple` — the readout cell. Only a text slot tracks a cell live. */
	readonly text: string;
	/** How the cell is written, which decides the readout's shape. */
	readonly holds: 'boolean' | 'string';
	/** The cell's opening value as source text. */
	readonly initial: string;
	/** The readout's opening value as source text. */
	readonly initialText: string;
	/** `onChange` only: the callback's parameter type. */
	readonly parameter?: string;
};

function identifier(prop: string): string {
	return prop.charAt(0).toUpperCase() + prop.slice(1).replace(/[^A-Za-z0-9]/g, '');
}

function quote(text: string): string {
	return JSON.stringify(text);
}

/** The parameter type of `(value: T) => void`, so the wrapper can annotate `next`. */
function callbackParameter(type: string): string {
	const opened = type.indexOf('(');
	const closed = type.lastIndexOf(')');
	if (opened < 0 || closed <= opened) return 'unknown';
	const parameter = type.slice(opened + 1, closed).trim();
	const colon = parameter.indexOf(':');
	return colon < 0 ? 'unknown' : parameter.slice(colon + 1).trim();
}

type ManifestProp = {
	readonly name: string;
	readonly type: string;
	readonly required: boolean;
	readonly default?: string;
	readonly doc?: string;
};
type ApiManifest = Readonly<
	Record<string, { readonly parts: readonly { readonly part: string; readonly props: readonly ManifestProp[] }[] }>
>;

let manifest: ApiManifest | undefined;

/**
 * Read with `fs` rather than through `components/docs/api-derive`: that module
 * reaches the manifest with a `?raw` import, which only Vite answers, and this
 * one runs inside the config. The derivation itself is still api-derive's —
 * `controlFor` and `initialValue` are imported, not re-implemented.
 */
function manifestProp(family: string, part: string, prop: string): ManifestProp {
	if (!manifest) {
		const fromHere = createRequire(import.meta.url);
		manifest = JSON.parse(
			readFileSync(fromHere.resolve('@markless/ui/api/manifest.json'), 'utf8'),
		) as ApiManifest;
	}
	const found = manifest[family]?.parts.find((one) => one.part === part)?.props.find((one) => one.name === prop);
	if (!found)
		throw new Error(
			`ui-playground: @markless/ui/api/manifest.json has no '${family}.${part}.${prop}', which ui-meta/${family}.ts asks the playground to draw.`,
		);
	return found;
}

function sourceLiteral(holds: 'boolean' | 'string', value: string | number | boolean | undefined): string {
	if (holds === 'boolean') return value === true || value === 'true' ? 'true' : 'false';
	return quote(value === undefined ? '' : String(value));
}

function readoutLiteral(holds: 'boolean' | 'string', value: string | number | boolean | undefined): string {
	if (holds === 'boolean') return quote(value === true || value === 'true' ? 'true' : 'false');
	return quote(value === undefined ? '' : String(value));
}

function controlOf(
	demo: DemoAnalysis,
	ref: PropRef,
	override: { readonly kind?: string; readonly options?: readonly string[] } | undefined,
): PlaygroundControl {
	const prop = manifestProp(demo.family, ref.part, ref.prop);
	const descriptor: ControlDescriptor = controlFor(prop.type);
	const authored = demo.attributes.find((attribute) => attribute.name === ref.prop);

	if (descriptor.kind === 'event') {
		// A callback is edited as an on/off event log, so the cell it writes is the
		// log's own switch rather than the prop.
		return {
			part: ref.part,
			prop: ref.prop,
			kind: 'event',
			type: descriptor.type,
			options: [],
			cell: 'logging',
			text: 'tLogging',
			holds: 'boolean',
			initial: 'false',
			initialText: quote('false'),
			parameter: callbackParameter(descriptor.type),
		};
	}

	const holds: 'boolean' | 'string' = descriptor.kind === 'toggle' ? 'boolean' : 'string';
	const seen = authored?.literal ?? initialValue(prop.default);
	let kind: PlaygroundControl['kind'] = descriptor.kind === 'toggle' ? 'toggle' : descriptor.kind === 'select' ? 'select' : 'textbox';
	let options: readonly string[] = descriptor.options ?? [];

	// A family's own parts name the values its root can hold, so `value` gets a
	// closed list from the demo instead of a free-text field.
	if (kind === 'textbox' && ref.prop === 'value' && demo.itemValues.length > 0)
		options = [...demo.itemValues, ''];
	if (override?.options && override.options.length > 0) options = override.options;
	if (options.length > 0) kind = 'select';
	if (override?.kind === 'toggle' || override?.kind === 'select' || override?.kind === 'textbox')
		kind = override.kind;

	if (descriptor.kind === 'stepper' || descriptor.kind === 'none')
		if (kind === 'textbox' && options.length === 0)
			throw new Error(
				`ui-playground: '${demo.family}.${ref.part}.${ref.prop}' is typed '${descriptor.type}', which no playground control draws yet. Give it a kind or an option set in ui-meta/${demo.family}.ts.`,
			);

	return {
		part: ref.part,
		prop: ref.prop,
		kind,
		type: descriptor.type,
		options,
		cell: `c${identifier(ref.prop)}`,
		text: `t${identifier(ref.prop)}`,
		holds,
		initial: sourceLiteral(holds, seen),
		initialText: readoutLiteral(holds, seen),
	};
}

/** The controls a family's page draws: the quick row first, then "Show all". */
export function playgroundControls(demo: DemoAnalysis, meta: FamilyMeta): readonly PlaygroundControl[] {
	const overrides = new Map(
		(meta.overrides ?? []).map((one) => [`${one.part}.${one.prop}`, one] as const),
	);
	return [...meta.quick, ...meta.showAll].map((ref) =>
		controlOf(demo, ref, overrides.get(`${ref.part}.${ref.prop}`)),
	);
}

// --- the generated module ---------------------------------------------------

const SLOT = (index: number) => `PGSLOT${index}`;

/** A run of the highlighted source that follows a control instead of sitting still. */
type SlotRun = { readonly style: string; readonly cell: string };

type LineSegment =
	| { readonly kind: 'tokens'; readonly tokens: readonly CodeToken[] }
	| { readonly kind: 'slot'; readonly run: SlotRun };

type PanelLine =
	| { readonly kind: 'plain'; readonly line: CodeLine }
	| { readonly kind: 'split'; readonly id: string; readonly segments: readonly LineSegment[] };

/**
 * Splits the highlighted lines at the sentinels the display source carries, so
 * each root attribute value becomes a text slot bound to its readout cell.
 */
function panelLines(lines: readonly CodeLine[], cells: readonly string[]): readonly PanelLine[] {
	const pattern = new RegExp(`(${cells.map((_, index) => SLOT(index)).join('|')})`);
	return lines.map((line) => {
		if (cells.length === 0 || !line.tokens.some((token) => hasSlot(token, pattern)))
			return { kind: 'plain', line };
		const segments: LineSegment[] = [];
		let run: CodeToken[] = [];
		let serial = 0;
		const flush = () => {
			if (run.length > 0) segments.push({ kind: 'tokens', tokens: run });
			run = [];
		};
		for (const token of line.tokens) {
			const runs = [...token.plain, ...token.hover];
			const carrier = runs.find((one) => pattern.test(one.text));
			if (!carrier) {
				run.push(token);
				continue;
			}
			const parts = carrier.text.split(pattern);
			for (const part of parts) {
				const at = cells.findIndex((_, index) => part === SLOT(index));
				if (at >= 0) {
					flush();
					segments.push({ kind: 'slot', run: { style: carrier.style, cell: cells[at] } });
					continue;
				}
				if (part === '') continue;
				serial += 1;
				run.push({ id: `${token.id}s${serial}`, plain: [{ id: `${token.id}r${serial}`, text: part, style: carrier.style }], hover: [] });
			}
		}
		flush();
		return { kind: 'split', id: line.id, segments };
	});
}

function hasSlot(token: CodeToken, pattern: RegExp): boolean {
	for (const run of token.plain) if (pattern.test(run.text)) return true;
	for (const run of token.hover) if (pattern.test(run.text)) return true;
	return false;
}

/**
 * The demo as the code panel shows it: the authored file with each controlled
 * root attribute value swapped for a sentinel, and the `<style>` block lifted
 * out into its own tab.
 */
function displaySource(demo: DemoAnalysis, slots: readonly { readonly attribute: RootAttribute }[]): string {
	const edits = slots
		.map((slot, index) => ({ slot, index }))
		.filter(({ slot }) => slot.attribute.valueStart !== undefined)
		.sort((left, right) => (right.slot.attribute.valueStart ?? 0) - (left.slot.attribute.valueStart ?? 0));
	let text = demo.source;
	for (const { slot, index } of edits)
		text = `${text.slice(0, slot.attribute.valueStart)}${SLOT(index)}${text.slice(slot.attribute.valueEnd)}`;
	if (demo.styleStart === undefined || demo.styleEnd === undefined) return text.trimEnd();
	const lineStart = text.lastIndexOf('\n', demo.styleStart) + 1;
	let lineEnd = text.indexOf('\n', demo.styleEnd);
	if (lineEnd < 0) lineEnd = text.length;
	else lineEnd += 1;
	return `${text.slice(0, lineStart).trimEnd()}\n${text.slice(lineEnd)}`.trimEnd();
}

function componentName(family: string, stem: string): string {
	return `${identifier(family)}${identifier(stem)}Playground`;
}

const CHROME_FAMILIES = ['collapsible', 'select', 'tabs', 'toggle', 'tooltip'];



function toggleCell(control: PlaygroundControl, extra: string): string {
	const label = control.kind === 'event' ? control.prop : control.prop;
	return `				<div class="pg-cell">
					<toggle.root
						class="pg-ctl"
						checked={${control.cell}}
						onChange={(next: boolean) => {
							${control.cell} = next;
							${control.text} = next ? 'true' : 'false';${extra}
						}}
					>
						<toggle.label class="pg-name">${label}</toggle.label>
						<toggle.trigger class="pg-switch">
							<toggle.thumb class="pg-knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="pg-state">{${control.text}}</span>
${hintFor(control)}
				</div>`;
}

function hintFor(control: PlaygroundControl): string {
	return `					<tooltip.root class="pg-hint">
						<tooltip.trigger class="pg-dot" aria-label="Type of ${control.prop}">?</tooltip.trigger>
						<tooltip.content class="pg-tip">{${quote(control.type)}}</tooltip.content>
					</tooltip.root>`;
}

function selectCell(control: PlaygroundControl): string {
	const items = control.options
		.map(
			(option) => `							<select.item class="pg-pick-item" value=${quote(option)}>
								<select.itemlabel>${option === '' ? '(none)' : option}</select.itemlabel>
							</select.item>`,
		)
		.join('\n');
	return `				<div class="pg-cell">
					<select.root
						class="pg-ctl pg-pick"
						value={${control.cell}}
						onChange={(next: string) => {
							${control.cell} = next;
							${control.text} = next;
						}}
					>
						<select.label class="pg-name">${control.prop}</select.label>
						<select.trigger class="pg-pick-trigger">
							<span class="pg-pick-value">{${control.text}}</span>
						</select.trigger>
						<select.content class="pg-pick-list">
${items}
						</select.content>
					</select.root>
${hintFor(control)}
				</div>`;
}

function textboxCell(control: PlaygroundControl): string {
	return `				<div class="pg-cell">
					<textbox.root
						class="pg-ctl"
						value={${control.cell}}
						onChange={(next: string) => {
							${control.cell} = next;
							${control.text} = next;
						}}
					>
						<textbox.label class="pg-name">${control.prop}</textbox.label>
						<textbox.input class="pg-field" />
					</textbox.root>
					<span class="pg-state">{${control.text}}</span>
${hintFor(control)}
				</div>`;
}

function controlCell(control: PlaygroundControl): string {
	if (control.kind === 'event')
		return toggleCell(
			control,
			`\n							logClass = next ? 'pg-log' : 'pg-log pg-log-quiet';`,
		);
	if (control.kind === 'toggle') return toggleCell(control, '');
	if (control.kind === 'select') return selectCell(control);
	return textboxCell(control);
}

/** The root's opening tag, with every controlled attribute reading a cell. */
function openingTag(demo: DemoAnalysis, controls: readonly PlaygroundControl[]): string {
	const byProp = new Map(controls.filter((one) => one.kind !== 'event').map((one) => [one.prop, one]));
	const event = controls.find((one) => one.kind === 'event' && one.prop === 'onChange');
	const value = controls.find((one) => one.prop === 'value' && one.kind !== 'event');
	const written: string[] = [];
	const seen = new Set<string>();

	for (const attribute of demo.attributes) {
		if (attribute.name === 'onChange') continue;
		seen.add(attribute.name);
		const control = byProp.get(attribute.name);
		if (!control) {
			written.push(demo.source.slice(attribute.start, attribute.end));
			continue;
		}
		written.push(`${control.prop}={${control.cell}}`);
	}
	for (const control of byProp.values())
		if (!seen.has(control.prop)) written.push(`${control.prop}={${control.cell}}`);

	if (event) {
		const authored = demo.attributes.find((one) => one.name === 'onChange');
		const lines: string[] = [];
		if (value) {
			lines.push(
				value.holds === 'boolean'
					? `\t\t\t\t\t\t${value.cell} = next === true;`
					: `\t\t\t\t\t\tconst shown = typeof next === 'string' ? next : (next[0] ?? '');\n\t\t\t\t\t\t${value.cell} = shown;`,
			);
			lines.push(
				value.holds === 'boolean'
					? `\t\t\t\t\t\t${value.text} = next === true ? 'true' : 'false';`
					: `\t\t\t\t\t\t${value.text} = shown;`,
			);
		}
		lines.push('\t\t\t\t\t\tevents = logging ? events + 1 : events;');
		if (authored?.expression) lines.push(`\t\t\t\t\t\t(${authored.expression})(next);`);
		written.push(
			`onChange={(next: ${event.parameter ?? 'unknown'}) => {\n${lines.join('\n')}\n\t\t\t\t\t}}`,
		);
	} else {
		const authored = demo.attributes.find((one) => one.name === 'onChange');
		if (authored) written.push(demo.source.slice(authored.start, authored.end));
	}

	const body = written.map((one) => `\n\t\t\t\t\t${one}`).join('');
	return `<${demo.tag}${body}\n\t\t\t\t${demo.selfClosing ? '/>' : '>'}`;
}

/** The demo body as authored, minus the `<style>` block the outer card carries. */
function demoBody(demo: DemoAnalysis): string {
	if (demo.selfClosing) return '';
	let inner = demo.source.slice(demo.childrenStart, demo.childrenEnd);
	if (demo.styleStart !== undefined && demo.styleEnd !== undefined) {
		const from = demo.styleStart - demo.childrenStart;
		const to = demo.styleEnd - demo.childrenStart;
		inner = `${inner.slice(0, from).trimEnd()}\n${inner.slice(to).replace(/^[ \t]*\n/, '')}`;
	}
	return inner;
}

function lineMarkup(list: string, indent: string): string {
	return `${indent}@for (const line of ${list}; key line.id) {
${indent}	<span class="pg-line">
${indent}		@for (const token of line.tokens; key token.id) {
${indent}			<span class="pg-run">
${tokenRuns(`${indent}				`)}
${indent}			</span>
${indent}		}
${indent}	</span>
${indent}}`;
}

function tokenRuns(indent: string): string {
	return `${indent}@for (const run of token.plain; key run.id) {
${indent}	<span style={run.style}>{run.text}</span>
${indent}}
${indent}@for (const run of token.hover; key run.id) {
${indent}	<span class="tsrx-hover" tabindex="0" role="img" aria-label={run.label} data-doc-title={run.title} data-doc={run.doc}><span style={run.style}>{run.text}</span><span class="tsrx-tip" aria-hidden="true"><span class="tsrx-tip-title">{run.title}</span><span class="tsrx-tip-body">{run.doc}</span></span></span>
${indent}}`;
}

function tokenListMarkup(list: string, indent: string): string {
	return `${indent}@for (const token of ${list}; key token.id) {
${indent}	<span class="pg-run">
${tokenRuns(`${indent}		`)}
${indent}	</span>
${indent}}`;
}

type PaneEmission = { readonly consts: string[]; readonly markup: string };

function paneMarkup(lines: readonly PanelLine[], prefix: string, indent: string): PaneEmission {
	const consts: string[] = [];
	const chunks: string[] = [];
	let plain: CodeLine[] = [];
	const flush = () => {
		if (plain.length === 0) return;
		const name = `${prefix}${consts.length}`;
		consts.push(`const ${name} = ${JSON.stringify(plain)};`);
		chunks.push(lineMarkup(name, indent));
		plain = [];
	};
	for (const entry of lines) {
		if (entry.kind === 'plain') {
			plain.push(entry.line);
			continue;
		}
		flush();
		const inner: string[] = [];
		for (const segment of entry.segments) {
			if (segment.kind === 'tokens') {
				const name = `${prefix}${consts.length}`;
				consts.push(`const ${name} = ${JSON.stringify(segment.tokens)};`);
				inner.push(tokenListMarkup(name, `${indent}\t`));
				continue;
			}
			const style = segment.run.style === '' ? '' : ` style=${quote(segment.run.style)}`;
			inner.push(`${indent}\t<span class="pg-run"><span${style}>{${segment.run.cell}}</span></span>`);
		}
		chunks.push(`${indent}<span class="pg-line">\n${inner.join('\n')}\n${indent}</span>`);
	}
	flush();
	return { consts, markup: chunks.join('\n') };
}

export type PlaygroundInput = {
	readonly demo: DemoAnalysis;
	readonly meta: FamilyMeta;
	readonly controls: readonly PlaygroundControl[];
	readonly sourceLines: readonly CodeLine[];
	readonly cssLines: readonly CodeLine[];
	readonly sourceLabel: string;
	readonly cssLabel: string;
	readonly chromeCss: string;
};

function presetTable(controls: readonly PlaygroundControl[], presets: readonly FamilyPreset[]): string {
	const editable = controls.filter((one) => one.kind !== 'event');
	const rows = presets.map((preset) => {
		const fields = [`label: ${quote(preset.label)}`];
		for (const control of editable) {
			const written = preset.values[control.prop];
			const holds = control.holds;
			fields.push(
				`${control.cell}: ${written === undefined ? control.initial : sourceLiteral(holds, written)}`,
			);
			fields.push(
				`${control.text}: ${written === undefined ? control.initialText : readoutLiteral(holds, written)}`,
			);
		}
		return `\t${quote(preset.name)}: { ${fields.join(', ')} },`;
	});
	return `const presets: Readonly<Record<string, Readonly<Record<string, string | boolean>>>> = {\n${rows.join('\n')}\n};`;
}

function scenarioBar(controls: readonly PlaygroundControl[], presets: readonly FamilyPreset[]): string {
	const editable = controls.filter((one) => one.kind !== 'event');
	const writes = editable
		.flatMap((control) => [
			`							${control.cell} = preset[${quote(control.cell)}] as ${control.holds};`,
			`							${control.text} = preset[${quote(control.text)}] as string;`,
		])
		.join('\n');
	const items = presets
		.map(
			(preset) => `						<select.item class="pg-pick-item" value=${quote(preset.name)}>
							<select.itemlabel>${preset.label}</select.itemlabel>
						</select.item>`,
		)
		.join('\n');
	return `			<select.root
				class="pg-pick pg-bar-pick"
				value={scenarioName}
				onChange={(next: string) => {
					const preset = presets[next];
					scenarioName = next;
					scenario = preset.label as string;
${writes}
				}}
			>
				<select.label class="pg-bar-name">Scenario</select.label>
				<select.trigger class="pg-pick-trigger pg-bar-trigger">
					<span class="pg-pick-value">{scenario}</span>
				</select.trigger>
				<select.content class="pg-pick-list pg-bar-list">
${items}
				</select.content>
			</select.root>`;
}

/** The whole generated module: chrome, demo, code panel, one island. */
export function playgroundModule(input: PlaygroundInput): string {
	const { demo, meta, controls } = input;
	const presets = meta.presets ?? [];
	if (presets.length === 0)
		throw new Error(
			`ui-playground: ui-meta/${demo.family}.ts lists no presets, so the Scenario select has nothing to offer.`,
		);

	const slots = demo.attributes
		.filter((attribute) => attribute.valueStart !== undefined)
		.map((attribute) => ({
			attribute,
			control: controls.find((one) => one.prop === attribute.name && one.kind !== 'event'),
		}))
		.filter((entry): entry is { attribute: RootAttribute; control: PlaygroundControl } => entry.control !== undefined);

	const source = paneMarkup(
		panelLines(input.sourceLines, slots.map((entry) => entry.control.text)),
		'srcLines',
		'\t\t\t\t\t\t\t\t\t',
	);
	const css = paneMarkup(panelLines(input.cssLines, []), 'cssLines', '\t\t\t\t\t\t\t\t\t');

	const families = [...new Set([demo.family, ...CHROME_FAMILIES, ...(controls.some((one) => one.kind === 'textbox') ? ['textbox'] : [])])].sort();

	const cells: string[] = [];
	for (const control of controls) {
		cells.push(`\tlet ${control.cell} = state(${control.initial});`);
		cells.push(`\tlet ${control.text} = state(${control.initialText});`);
	}
	cells.push(`\tlet events = state(0);`);
	cells.push(`\tlet logClass = state('pg-log pg-log-quiet');`);
	cells.push(`\tlet scenario = state(${quote(presets[0].label)});`);
	cells.push(`\tlet scenarioName = state(${quote(presets[0].name)});`);

	const quick = controls.slice(0, meta.quick.length).map(controlCell).join('\n\n');
	const rest = controls.slice(meta.quick.length).map(controlCell).join('\n\n');

	const cssTab =
		input.cssLines.length === 0
			? ''
			: `
					<tabs.trigger class="pg-tab" value="css">${input.cssLabel}</tabs.trigger>`;
	const cssPane =
		input.cssLines.length === 0
			? ''
			: `
					<tabs.content class="pg-pane" value="css">
						<collapsible.root class="pg-clamp">
							<div class="pg-code-body">
								<pre class="pg-shiki">
${css.markup}
								</pre>
							</div>
							<span class="pg-fade" aria-hidden="true"></span>
							<collapsible.trigger class="pg-expand">Expand code</collapsible.trigger>
						</collapsible.root>
					</tabs.content>`;

	return `import { state } from '@markless/core';
import { ${families.join(', ')} } from '@markless/ui';

${source.consts.join('\n')}
${css.consts.join('\n')}
${presetTable(controls, presets)}

export default function ${componentName(demo.family, demo.stem)}() @{
${cells.join('\n')}

	<section class="pg">
		<collapsible.root class="pg-controls">
			<div class="pg-quick">
${quick}

				<collapsible.trigger class="pg-showall">Show all</collapsible.trigger>
			</div>

			<collapsible.content class="pg-rest">
${rest}
			</collapsible.content>
		</collapsible.root>

		<p class={logClass}>onChange called {events} time(s)</p>

		<div class="pg-stage">
			${openingTag(demo, controls)}${demoBody(demo)}${demo.closing}
		</div>

		<div class="pg-bar">
${scenarioBar(controls, presets)}
		</div>

		<div class="pg-code">
			<div class="pg-panel-outer" data-scenario=${quote(`${demo.family}/${demo.stem}`)}>
				<tabs.root class="pg-panel" value="source">
					<tabs.list class="pg-strip">
						<div class="pg-strip-row" role="presentation">
							<tabs.trigger class="pg-tab" value="source">${input.sourceLabel}</tabs.trigger>${cssTab}
						</div>
					</tabs.list>
					<div class="pg-panes">
						<tabs.content class="pg-pane" value="source">
							<collapsible.root class="pg-clamp">
								<div class="pg-code-body">
									<pre class="pg-shiki">
${source.markup}
									</pre>
								</div>
								<span class="pg-fade" aria-hidden="true"></span>
								<collapsible.trigger class="pg-expand">Expand code</collapsible.trigger>
							</collapsible.root>
						</tabs.content>${cssPane}
					</div>
				</tabs.root>
			</div>
		</div>

		<style>
${input.chromeCss}

${demo.css}
		</style>
	</section>
}
`;
}

export { displaySource, componentName };
