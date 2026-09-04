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
import {
	attributeText,
	listText,
	pickValue,
	valueText,
	type ControlValue,
} from '../components/docs/playground/slot-text.ts';
import type { FamilyMeta, FamilyPreset, PropRef } from '../components/docs/ui-meta/index.ts';
import { RUN_TYPES, docsMarkup, runMarkup, type Doc, type Line, type Run } from './ui-code-runs.ts';
import { docRules } from './ui-playground-css.ts';

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
	readonly literal?: ControlValue | number;
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
	/**
	 * The values the family's own parts below the root can hold: literal `value=`
	 * attributes, or the `value` field of the data a `@for` repeats them over.
	 */
	readonly itemValues: readonly string[];
	/** The statements the demo body runs ahead of its element, the data a repeat reads. */
	readonly prelude: string;
};

/** `name` -> the array literal a body-level `const name = [...]` holds. */
function arrayBindings(statements: readonly AstNode[]): Map<string, AstNode> {
	const found = new Map<string, AstNode>();
	for (const statement of statements) {
		if (statement.type !== 'VariableDeclaration') continue;
		for (const declarator of (statement as { declarations?: AstNode[] }).declarations ?? []) {
			const id = declarator.id as AstNode;
			const init = (declarator as { init?: AstNode | null }).init;
			if (id.type === 'Identifier' && init?.type === 'ArrayExpression') found.set(String(id.name), init);
		}
	}
	return found;
}

/** The string each object in `array` holds under `field`. */
function fieldLiterals(array: AstNode, field: string): string[] {
	const out: string[] = [];
	for (const element of ((array as { elements?: (AstNode | null)[] }).elements ?? [])) {
		if (element?.type !== 'ObjectExpression') continue;
		for (const property of (element as { properties?: AstNode[] }).properties ?? []) {
			const key = property.key as AstNode | undefined;
			const name = key?.type === 'Identifier' ? String(key.name) : key?.type === 'Literal' ? String(key.value) : '';
			if (name !== field) continue;
			const value = literalOf(property.value as AstNode);
			if (typeof value === 'string') out.push(value);
		}
	}
	return out;
}

function literalOf(node: AstNode | null | undefined): ControlValue | number | undefined {
	if (!node) return undefined;
	if (node.type === 'ArrayExpression') {
		const items = ((node as { elements?: (AstNode | null)[] }).elements ?? []).map((item) =>
			literalOf(item),
		);
		return items.every((item): item is string => typeof item === 'string') ? items : undefined;
	}
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

	const statements = ((block as { body?: AstNode[] }).body ?? []) as AstNode[];
	const arrays = arrayBindings(statements);
	const prelude =
		statements.length === 0
			? ''
			: source.slice(source.lastIndexOf('\n', statements[0].start) + 1, statements[statements.length - 1].end);

	const itemValues: string[] = [];
	const hold = (value: string) => {
		if (!itemValues.includes(value)) itemValues.push(value);
	};
	// `rows` maps a repeat's row name to the array it walks, for `value={row.field}`.
	const walk = (node: AstNode, rows: ReadonlyMap<string, AstNode>) => {
		let scope = rows;
		if (node.type === 'JSXForExpression') {
			const loop = node.statement as AstNode;
			const row = ((loop.left as AstNode).declarations as AstNode[])?.[0]?.id as AstNode | undefined;
			const over = loop.right as AstNode;
			const array = over.type === 'Identifier' ? arrays.get(String(over.name)) : undefined;
			if (row?.type === 'Identifier' && array) scope = new Map([...rows, [String(row.name), array]]);
		}
		if (node.type === 'JSXElement' && node !== root) {
			const name = jsxName((node.openingElement as AstNode).name as AstNode);
			if (name.startsWith(`${family}.`)) {
				for (const attribute of ((node.openingElement as AstNode).attributes as AstNode[]) ?? []) {
					if (attribute.type !== 'JSXAttribute') continue;
					const read = attributeOf(source, attribute);
					if (read.name !== 'value') continue;
					if (typeof read.literal === 'string') {
						hold(read.literal);
						continue;
					}
					const expression = (attribute.value as AstNode | null)?.type === 'JSXExpressionContainer' ? ((attribute.value as AstNode).expression as AstNode) : undefined;
					if (expression?.type !== 'MemberExpression' || expression.computed) continue;
					const object = expression.object as AstNode;
					const property = expression.property as AstNode;
					const array = object.type === 'Identifier' ? scope.get(String(object.name)) : undefined;
					if (array && property.type === 'Identifier') for (const value of fieldLiterals(array, String(property.name))) hold(value);
				}
			}
		}
		for (const child of children(node)) walk(child, scope);
	};
	walk(root, new Map());

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
		prelude,
	};
}

// --- the control model ------------------------------------------------------

/** One control the generated chrome draws, and the cells it writes. */
export type PlaygroundControl = {
	readonly part: string;
	readonly prop: string;
	readonly kind: 'toggle' | 'select' | 'textbox' | 'event';
	/** The prop's type text, on the last line of the control's hint and typing the cell. */
	readonly type: string;
	/** What the prop does, a sentence or two from the manifest, for the control's hint. */
	readonly doc: string;
	readonly options: readonly string[];
	/** `cMultiple` — the cell the demo's prop reads. */
	readonly cell: string;
	/** `tMultiple` — what the code panel prints for the prop. Only a text slot tracks a cell live. */
	readonly text: string;
	/** `sValue` — the select trigger's label, `ship, returns` for a list. */
	readonly shown: string;
	/** `pValue` — the value the select holding the control is given. */
	readonly pick: string;
	/** How the cell is written. */
	readonly holds: 'boolean' | 'string';
	/** The type admits a list of strings, so `multiple` turns the value into one. */
	readonly list: boolean;
	/** The cell's opening value. */
	readonly seen: ControlValue;
	/** The family's own default, which the code panel leaves unwritten. */
	readonly fallback: boolean | string;
	/** `onChange` only: the callback's parameter type. */
	readonly parameter?: string;
};

/**
 * The manifest doc cut down to a hint: its first paragraph, the first two
 * sentences of that, and the backticks dropped since the tip is mono already.
 */
function hintDoc(doc: string | undefined): string {
	const paragraph = (doc ?? '').split(/\n[ \t]*\n/)[0].replace(/\s+/g, ' ').trim();
	const sentences = paragraph.match(/[^.!?]+[.!?]+(?=\s|$)/g);
	const cut = sentences ? sentences.slice(0, 2).join('').trim() : paragraph;
	return cut.replaceAll('`', '');
}

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

function controlValue(holds: 'boolean' | 'string', value: ControlValue | number | undefined): ControlValue {
	if (holds === 'boolean') return value === true || value === 'true';
	if (value === undefined) return '';
	if (typeof value === 'boolean') return String(value);
	return typeof value === 'number' ? String(value) : value;
}

function sourceLiteral(value: ControlValue): string {
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'string') return quote(value);
	return `[${value.map(quote).join(', ')}]`;
}

function controlOf(
	demo: DemoAnalysis,
	ref: PropRef,
	override: { readonly kind?: string; readonly options?: readonly string[] } | undefined,
): PlaygroundControl {
	const prop = manifestProp(demo.family, ref.part, ref.prop);
	const descriptor: ControlDescriptor = controlFor(prop.type);
	const authored = demo.attributes.find((attribute) => attribute.name === ref.prop);
	const cells = {
		cell: `c${identifier(ref.prop)}`,
		text: `t${identifier(ref.prop)}`,
		shown: `s${identifier(ref.prop)}`,
		pick: `p${identifier(ref.prop)}`,
	};

	if (descriptor.kind === 'event') {
		// A callback is edited as an on/off event log, so the cell it writes is the
		// log's own switch rather than the prop.
		return {
			part: ref.part,
			prop: ref.prop,
			kind: 'event',
			type: descriptor.type,
			doc: hintDoc(prop.doc),
			options: [],
			...cells,
			cell: 'logging',
			holds: 'boolean',
			list: false,
			seen: false,
			fallback: false,
			parameter: callbackParameter(descriptor.type),
		};
	}

	const holds: 'boolean' | 'string' = descriptor.kind === 'toggle' ? 'boolean' : 'string';
	const fallback = controlValue(holds, initialValue(prop.default));
	const seen = controlValue(holds, authored?.literal ?? initialValue(prop.default));
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
		doc: hintDoc(prop.doc),
		options,
		...cells,
		holds,
		list: holds === 'string' && descriptor.members.some((member) => /\bstring\[\]$|^Array<|^ReadonlyArray</.test(member)),
		seen,
		fallback: typeof fallback === 'boolean' || typeof fallback === 'string' ? fallback : '',
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

// --- the code panel's slots -------------------------------------------------

const SLOT = (index: number) => `PGSLOT${index}`;
const SLOT_PATTERN = /(PGSLOT\d+)/;

/**
 * One run of the shown source that follows a control. An authored string value
 * keeps its `value=` and the slot stands in for the quoted literal; every other
 * control's slot is the whole attribute, or nothing at its default.
 */
export type CodeSlot = {
	readonly control: PlaygroundControl;
	readonly form: 'value' | 'attribute';
	/** The whitespace the slot prints ahead of the attribute, taken from the source. */
	readonly lead: string;
	/** What the slot replaces in the authored file; absent for a prop the demo never wrote. */
	readonly start?: number;
	readonly end?: number;
	/** The characters either side of the sentinel that the slot's text carries itself. */
	readonly before: string;
	readonly after: string;
};

/** Where the controls the demo never wrote are printed: just inside the root's `>`. */
function tagEnd(demo: DemoAnalysis): number {
	let at = demo.openingEnd - (demo.selfClosing ? 2 : 1);
	while (at > demo.openingStart && /\s/.test(demo.source[at - 1] ?? '')) at -= 1;
	return at;
}

/** The slot each editable control gets in the code panel, authored or not. */
export function codeSlots(demo: DemoAnalysis, controls: readonly PlaygroundControl[]): readonly CodeSlot[] {
	return controls
		.filter((control) => control.kind !== 'event')
		.map((control) => {
			const authored = demo.attributes.find((attribute) => attribute.name === control.prop);
			if (!authored) return { control, form: 'attribute', lead: ' ', before: ' ', after: '' };
			if (control.holds === 'string' && authored.valueStart !== undefined && authored.valueEnd !== undefined)
				return {
					control,
					form: 'value',
					lead: '',
					start: authored.valueStart,
					end: authored.valueEnd,
					before: demo.source[authored.valueStart - 1] ?? '',
					after: demo.source[authored.valueEnd] ?? '',
				};
			const spaced = demo.source[authored.start - 1] === ' ' && !/\s/.test(demo.source[authored.start - 2] ?? '');
			return {
				control,
				form: 'attribute',
				lead: spaced ? ' ' : '',
				start: authored.start,
				end: authored.end,
				before: spaced ? ' ' : '',
				after: '',
			};
		});
}

/**
 * The demo as the code panel shows it: the authored file with each slot swapped
 * for a sentinel, and the `<style>` block lifted out into its own tab.
 */
function displaySource(demo: DemoAnalysis, slots: readonly CodeSlot[]): string {
	const edits: { readonly at: number; readonly to: number; readonly text: string }[] = slots.flatMap(
		(slot, index) =>
			slot.start === undefined || slot.end === undefined ? [] : [{ at: slot.start, to: slot.end, text: SLOT(index) }],
	);
	const inserted = slots.flatMap((slot, index) => (slot.start === undefined ? [` ${SLOT(index)}`] : []));
	if (inserted.length > 0) edits.push({ at: tagEnd(demo), to: tagEnd(demo), text: inserted.join('') });
	edits.sort((left, right) => right.at - left.at);
	let text = demo.source;
	for (const edit of edits) text = `${text.slice(0, edit.at)}${edit.text}${text.slice(edit.to)}`;
	if (demo.styleStart === undefined || demo.styleEnd === undefined) return text.trimEnd();
	const styleStart = demo.styleStart + (text.length - demo.source.length);
	const styleEnd = demo.styleEnd + (text.length - demo.source.length);
	const lineStart = text.lastIndexOf('\n', styleStart) + 1;
	let lineEnd = text.indexOf('\n', styleEnd);
	if (lineEnd < 0) lineEnd = text.length;
	else lineEnd += 1;
	return `${text.slice(0, lineStart).trimEnd()}\n${text.slice(lineEnd)}`.trimEnd();
}

type LineSegment =
	| { readonly kind: 'runs'; readonly runs: readonly Run[] }
	| { readonly kind: 'slot'; readonly class?: string; readonly slot: CodeSlot };

type PanelLine =
	| { readonly kind: 'plain'; readonly line: Line }
	| { readonly kind: 'split'; readonly id: string; readonly segments: readonly LineSegment[] };

/** Drops `char` from the edge of the neighbouring text, when it is there to drop. */
function trimEdge(runs: readonly Run[], char: string, side: 'end' | 'start'): readonly Run[] {
	if (char === '' || runs.length === 0) return runs;
	const at = side === 'end' ? runs.length - 1 : 0;
	const run = runs[at];
	const matches = side === 'end' ? run.text.endsWith(char) : run.text.startsWith(char);
	if (!matches) return runs;
	const text = side === 'end' ? run.text.slice(0, -char.length) : run.text.slice(char.length);
	const next = [...runs];
	if (text === '') next.splice(at, 1);
	else next[at] = { ...run, text };
	return next;
}

/** The colour class alone: a piece cut off a run keeps its colour, not its hover. */
function colourOf(run: Run): string | undefined {
	const kept = (run.class ?? '').replace(/\btsrx-hover\b/, '').trim();
	return kept === '' ? undefined : kept;
}

/**
 * Splits the highlighted lines at the sentinels the display source carries, so
 * each slot becomes a text run bound to its control's text cell. The character
 * either side of a sentinel — the space before an attribute, the quotes round a
 * value — is dropped from the still text because the slot prints it itself.
 */
function panelLines(lines: readonly Line[], slots: readonly CodeSlot[]): readonly PanelLine[] {
	return lines.map((line) => {
		if (slots.length === 0 || !line.runs.some((run) => SLOT_PATTERN.test(run.text)))
			return { kind: 'plain', line };
		const segments: LineSegment[] = [];
		let held: Run[] = [];
		let serial = 0;
		const flush = () => {
			if (held.length > 0) segments.push({ kind: 'runs', runs: held });
			held = [];
		};
		for (const run of line.runs) {
			if (!SLOT_PATTERN.test(run.text)) {
				held.push(run);
				continue;
			}
			const colour = colourOf(run);
			for (const part of run.text.split(SLOT_PATTERN)) {
				const at = slots.findIndex((_, index) => part === SLOT(index));
				if (at >= 0) {
					flush();
					segments.push({ kind: 'slot', class: colour, slot: slots[at] });
					continue;
				}
				if (part === '') continue;
				serial += 1;
				held.push({ id: `${run.id}s${serial}`, text: part, ...(colour === undefined ? {} : { class: colour }) });
			}
		}
		flush();
		for (let at = 0; at < segments.length; at += 1) {
			const segment = segments[at];
			if (segment.kind !== 'slot') continue;
			const previous = segments[at - 1];
			if (previous?.kind === 'runs')
				segments[at - 1] = { kind: 'runs', runs: trimEdge(previous.runs, segment.slot.before, 'end') };
			const following = segments[at + 1];
			if (following?.kind === 'runs')
				segments[at + 1] = { kind: 'runs', runs: trimEdge(following.runs, segment.slot.after, 'start') };
		}
		return {
			kind: 'split',
			id: line.id,
			segments: segments.filter((segment) => segment.kind === 'slot' || segment.runs.length > 0),
		};
	});
}

// --- the generated module ---------------------------------------------------

function componentName(family: string, stem: string): string {
	return `${identifier(family)}${identifier(stem)}Playground`;
}

const CHROME_FAMILIES = ['collapsible', 'select', 'tabs', 'toggle', 'tooltip'];

/** The code panel's text for a control, as a source expression over `value`. */
function slotTextSource(slot: CodeSlot, value: string): string {
	if (slot.form === 'value') return `valueText(${value})`;
	return `attributeText(${quote(slot.control.prop)}, ${value}, ${sourceLiteral(slot.control.fallback)}, ${quote(slot.lead)})`;
}

/** The code panel's opening text for a control. */
function slotText(slot: CodeSlot): string {
	const { control } = slot;
	if (slot.form === 'value') return valueText(control.seen as string | readonly string[]);
	return attributeText(control.prop, control.seen, control.fallback, slot.lead);
}

/**
 * Every cell a control owns, written from one value expression. Reading the
 * value into a local first keeps each text derived from what was just written.
 */
function writes(slots: readonly CodeSlot[], control: PlaygroundControl, value: string, indent: string): string {
	const slot = slots.find((one) => one.control === control);
	const local = `next${identifier(control.prop)}`;
	const lines = [`const ${local} = ${value};`, `${control.cell} = ${local};`];
	if (slot) lines.push(`${control.text} = ${slotTextSource(slot, local)};`);
	if (control.kind === 'select') {
		lines.push(`${control.shown} = listText(${local});`);
		lines.push(`${control.pick} = pickValue(${local});`);
	}
	return lines.map((line) => `${indent}${line}`).join('\n');
}

/**
 * A list-capable `value` follows the `multiple` switch: on, the value becomes
 * the list it names; off, the first held entry. The code panel then prints the
 * form a consumer would write for that mode.
 */
function listFollowsMultiple(controls: readonly PlaygroundControl[]): { readonly multiple: PlaygroundControl; readonly value: PlaygroundControl } | undefined {
	const multiple = controls.find((one) => one.prop === 'multiple' && one.kind === 'toggle');
	const value = controls.find((one) => one.prop === 'value' && one.kind !== 'event' && one.list);
	return multiple && value ? { multiple, value } : undefined;
}

type Emit = {
	readonly controls: readonly PlaygroundControl[];
	readonly slots: readonly CodeSlot[];
};

function hintFor(control: PlaygroundControl): string {
	return `					<tooltip.root class="pg-hint">
						<tooltip.trigger class="pg-dot" aria-label="About ${control.prop}">
							<lucide.circlehelp class="ico ico-a" aria-hidden="true" />
							<ph.question class="ico ico-b" aria-hidden="true" />
							<tabler.helpcircle class="ico ico-c" aria-hidden="true" />
						</tooltip.trigger>
						<tooltip.content class="pg-tip">
							<span class="tsrx-tip-title">${control.prop}</span>
							<span class="tsrx-tip-body">{${quote(control.doc)}}</span>
							<span class="tsrx-tip-type">{${quote(control.type)}}</span>
						</tooltip.content>
					</tooltip.root>`;
}

function toggleCell(emit: Emit, control: PlaygroundControl, extra: string): string {
	const paired = listFollowsMultiple(emit.controls);
	const follow =
		paired && paired.multiple === control
			? `\n${writes(emit.slots, paired.value, `next ? heldList(${paired.value.cell}) : (heldList(${paired.value.cell})[0] ?? '')`, '\t\t\t\t\t\t\t')}`
			: '';
	return `				<div class="pg-cell">
					<toggle.root
						class="pg-ctl"
						checked={${control.cell}}
						onChange={(next: boolean) => {
${writes(emit.slots, control, 'next', '\t\t\t\t\t\t\t')}${extra}${follow}
						}}
					>
						<toggle.label class="pg-name">${control.prop}</toggle.label>
						<toggle.trigger class="pg-switch">
							<toggle.thumb class="pg-knob" />
						</toggle.trigger>
					</toggle.root>
${hintFor(control)}
				</div>`;
}

function selectCell(emit: Emit, control: PlaygroundControl): string {
	const paired = listFollowsMultiple(emit.controls);
	const chosen = paired && paired.value === control ? `${paired.multiple.cell} ? toggled(${control.cell}, next) : next` : 'next';
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
						value={${control.pick}}
						onChange={(next: string) => {
${writes(emit.slots, control, chosen, '\t\t\t\t\t\t\t')}
						}}
					>
						<select.label class="pg-name">${control.prop}</select.label>
						<select.trigger class="pg-pick-trigger">
							<span class="pg-pick-value">{${control.shown}}</span>
							<lucide.chevrondown class="pg-pick-caret" aria-hidden="true" />
						</select.trigger>
						<select.content class="pg-pick-list">
${items}
						</select.content>
					</select.root>
${hintFor(control)}
				</div>`;
}

function textboxCell(emit: Emit, control: PlaygroundControl): string {
	return `				<div class="pg-cell">
					<textbox.root
						class="pg-ctl"
						value={${control.cell}}
						onChange={(next: string) => {
${writes(emit.slots, control, 'next', '\t\t\t\t\t\t\t')}
						}}
					>
						<textbox.label class="pg-name">${control.prop}</textbox.label>
						<textbox.input class="pg-field" />
					</textbox.root>
${hintFor(control)}
				</div>`;
}

function controlCell(emit: Emit, control: PlaygroundControl): string {
	if (control.kind === 'event')
		return toggleCell(
			emit,
			control,
			`\n							logClass = next ? 'pg-log' : 'pg-log pg-log-quiet';`,
		);
	if (control.kind === 'toggle') return toggleCell(emit, control, '');
	if (control.kind === 'select') return selectCell(emit, control);
	return textboxCell(emit, control);
}

/** The root's opening tag, with every controlled attribute reading a cell. */
function openingTag(demo: DemoAnalysis, emit: Emit): string {
	const { controls, slots } = emit;
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

	const authored = demo.attributes.find((one) => one.name === 'onChange');
	if (event) {
		const lines: string[] = [];
		if (value) lines.push(writes(slots, value, value.holds === 'boolean' ? 'next === true' : 'next', '\t\t\t\t\t\t'));
		lines.push('\t\t\t\t\t\tevents = logging ? events + 1 : events;');
		if (authored?.expression) lines.push(`\t\t\t\t\t\t(${authored.expression})(next);`);
		written.push(
			`onChange={(next: ${event.parameter ?? 'unknown'}) => {\n${lines.join('\n')}\n\t\t\t\t\t}}`,
		);
	} else if (authored) written.push(demo.source.slice(authored.start, authored.end));

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
${runMarkup(`${indent}\t\t`)}
${indent}	</span>
${indent}}`;
}

type PaneEmission = { readonly consts: string[]; readonly markup: string };

/**
 * A pane's markup: plain lines as keyed repeats over module constants, and a
 * line holding a slot written out with the slot as a text run bound to its cell.
 */
function paneMarkup(lines: readonly PanelLine[], prefix: string, indent: string): PaneEmission {
	const consts: string[] = [];
	const chunks: string[] = [];
	let plain: Line[] = [];
	const flush = () => {
		if (plain.length === 0) return;
		const name = `${prefix}${consts.length}`;
		consts.push(`const ${name}: readonly Line[] = ${JSON.stringify(plain)};`);
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
			if (segment.kind === 'runs') {
				const name = `${prefix}${consts.length}`;
				consts.push(`const ${name}: readonly Run[] = ${JSON.stringify(segment.runs)};`);
				inner.push(runMarkup(`${indent}\t`, name));
				continue;
			}
			const cls = segment.class === undefined ? '' : ` class=${quote(segment.class)}`;
			inner.push(`${indent}\t<span${cls}>{${segment.slot.control.text}}</span>`);
		}
		chunks.push(`${indent}<span class="pg-line">\n${inner.join('\n')}\n${indent}</span>`);
	}
	flush();
	return { consts, markup: chunks.join('\n') };
}

/** One tab of the code chrome: the file name on the tab and the `<pre>` body as TSRX markup. */
export type ChromePane = { readonly value: string; readonly label: string; readonly markup: string };

/**
 * The tabs-and-clamp chrome round highlighted code, shared by the playground and
 * the standalone code panels so the two read as one thing. `bar` is extra
 * markup for the strip row, the playground's scenario picker.
 */
export function codePanelChrome(input: {
	readonly scenario: string;
	readonly panes: readonly ChromePane[];
	readonly bar?: string;
	readonly indent: string;
}): string {
	const { indent } = input;
	const tabs = input.panes
		.map((pane) => `${indent}\t\t\t\t<tabs.trigger class="pg-tab" value=${quote(pane.value)}>${pane.label}</tabs.trigger>`)
		.join('\n');
	const panes = input.panes
		.map(
			(pane) => `${indent}\t\t\t\t<tabs.content class="pg-pane" value=${quote(pane.value)}>
${indent}\t\t\t\t\t<pre class="pg-shiki shiki">
${pane.markup}
${indent}\t\t\t\t\t</pre>
${indent}\t\t\t\t</tabs.content>`,
		)
		.join('\n');
	return `${indent}<div class="pg-panel-outer" data-scenario=${quote(input.scenario)}>
${indent}\t<tabs.root class="pg-panel" value=${quote(input.panes[0].value)}>
${indent}\t\t<div class="pg-bar">
${indent}\t\t\t<tabs.list class="pg-strip">
${indent}\t\t\t\t<div class="pg-strip-row" role="presentation">
${tabs}
${indent}\t\t\t\t</div>
${indent}\t\t\t</tabs.list>${input.bar === undefined ? '' : `\n${input.bar}`}
${indent}\t\t</div>
${indent}\t\t<collapsible.root class="pg-clamp">
${indent}\t\t\t<div class="pg-code-body">
${indent}\t\t\t\t<div class="pg-panes">
${panes}
${indent}\t\t\t\t</div>
${indent}\t\t\t</div>
${indent}\t\t\t<span class="pg-fade" aria-hidden="true"></span>
${indent}\t\t\t<collapsible.trigger class="pg-expand">
${indent}\t\t\t\tExpand code
${indent}\t\t\t\t<span class="pg-expand-icons" aria-hidden="true">
${indent}\t\t\t\t\t<lucide.arrowright class="ico ico-a" />
${indent}\t\t\t\t\t<ph.arrowright class="ico ico-b" />
${indent}\t\t\t\t\t<tabler.arrowright class="ico ico-c" />
${indent}\t\t\t\t</span>
${indent}\t\t\t</collapsible.trigger>
${indent}\t\t</collapsible.root>
${indent}\t</tabs.root>
${indent}</div>`;
}

export type PlaygroundInput = {
	readonly demo: DemoAnalysis;
	readonly meta: FamilyMeta;
	readonly controls: readonly PlaygroundControl[];
	readonly slots: readonly CodeSlot[];
	readonly sourceLines: readonly Line[];
	readonly cssLines: readonly Line[];
	/** Every distinct hover doc of both panes, for the card's registry. */
	readonly docs: readonly Doc[];
	/** The colour classes the runs of both panes point at. */
	readonly colourCss: string;
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
			fields.push(`${control.cell}: ${sourceLiteral(written === undefined ? control.seen : controlValue(control.holds, written))}`);
		}
		return `\t${quote(preset.name)}: { ${fields.join(', ')} },`;
	});
	return `const presets: Readonly<Record<string, Readonly<Record<string, string | boolean | readonly string[]>>>> = {\n${rows.join('\n')}\n};`;
}

function cellType(control: PlaygroundControl): string {
	return control.holds === 'boolean' ? 'boolean' : control.list ? 'string | readonly string[]' : 'string';
}

function scenarioBar(emit: Emit, presets: readonly FamilyPreset[]): string {
	const editable = emit.controls.filter((one) => one.kind !== 'event');
	const written = editable
		.map((control) => writes(emit.slots, control, `preset[${quote(control.cell)}] as ${cellType(control)}`, '\t\t\t\t\t\t'))
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
${written}
				}}
			>
				<select.label class="pg-bar-name">Scenario</select.label>
				<select.trigger class="pg-pick-trigger pg-bar-trigger">
					<span class="pg-pick-value">{scenario}</span>
					<lucide.chevrondown class="pg-pick-caret" aria-hidden="true" />
				</select.trigger>
				<select.content class="pg-pick-list pg-bar-list">
${items}
				</select.content>
			</select.root>`;
}

/** The whole generated module: chrome, demo, code panel, one island. */
export function playgroundModule(input: PlaygroundInput): string {
	const { demo, meta, controls, slots } = input;
	const presets = meta.presets ?? [];
	if (presets.length === 0)
		throw new Error(
			`ui-playground: ui-meta/${demo.family}.ts lists no presets, so the Scenario select has nothing to offer.`,
		);
	const emit: Emit = { controls, slots };

	// A sentinel the highlighter documented becomes a slot, so its doc is never pointed at.
	const pointed = new Set<string>();
	for (const line of [...input.sourceLines, ...input.cssLines])
		for (const run of line.runs)
			if (run.doc !== undefined && !SLOT_PATTERN.test(run.text)) pointed.add(run.doc);
	const docs = input.docs.filter((doc) => pointed.has(doc.n));

	const source = paneMarkup(panelLines(input.sourceLines, slots), 'srcLines', '\t\t\t\t\t\t\t\t\t');
	const css = paneMarkup(panelLines(input.cssLines, []), 'cssLines', '\t\t\t\t\t\t\t\t\t');

	const families = [...new Set([demo.family, ...CHROME_FAMILIES, ...(controls.some((one) => one.kind === 'textbox') ? ['textbox'] : [])])].sort();

	const cells: string[] = [];
	for (const control of controls) {
		if (control.kind === 'event') {
			cells.push(`\tlet ${control.cell} = state(false);`);
			continue;
		}
		const slot = slots.find((one) => one.control === control);
		cells.push(`\tlet ${control.cell} = state<${cellType(control)}>(${sourceLiteral(control.seen)});`);
		if (slot) cells.push(`\tlet ${control.text} = state(${quote(slotText(slot))});`);
		if (control.kind === 'select') {
			const held = control.seen as string | readonly string[];
			cells.push(`\tlet ${control.shown} = state(${quote(listText(held))});`);
			cells.push(`\tlet ${control.pick} = state(${quote(pickValue(held))});`);
		}
	}
	cells.push(`\tlet events = state(0);`);
	cells.push(`\tlet logClass = state('pg-log pg-log-quiet');`);
	cells.push(`\tlet scenario = state(${quote(presets[0].label)});`);
	cells.push(`\tlet scenarioName = state(${quote(presets[0].name)});`);

	const quick = controls.slice(0, meta.quick.length).map((control) => controlCell(emit, control)).join('\n\n');
	const rest = controls.slice(meta.quick.length).map((control) => controlCell(emit, control)).join('\n\n');

	const panes: ChromePane[] = [{ value: 'source', label: input.sourceLabel, markup: source.markup }];
	if (input.cssLines.length > 0) panes.push({ value: 'css', label: input.cssLabel, markup: css.markup });

	return `import { state } from '@markless/core';
import { ${families.join(', ')} } from '@markless/ui';
import { attributeText, heldList, listText, pickValue, toggled, valueText } from '../slot-text.ts';
import { lucide, ph, tabler } from '@markless/ui';

${RUN_TYPES}

${source.consts.join('\n')}
${css.consts.join('\n')}
const docs: readonly Doc[] = ${JSON.stringify(docs)};
${presetTable(controls, presets)}

export default function ${componentName(demo.family, demo.stem)}() @{
${cells.join('\n')}
${demo.prelude === '' ? '' : `\n${demo.prelude}\n`}
	<section class="pg">
		<collapsible.root class="pg-controls">
			<div class="pg-quick">
${quick}

				<collapsible.trigger class="pg-showall">
					<span class="pg-showall-more">Show all</span>
					<span class="pg-showall-less">Show less</span>
					<lucide.chevrondown class="pg-showall-caret" aria-hidden="true" />
				</collapsible.trigger>
			</div>

			<collapsible.content class="pg-rest">
${rest}
			</collapsible.content>
		</collapsible.root>

		<p class={logClass}>onChange called {events} time(s)</p>

		<div class="pg-stage">
			${openingTag(demo, emit)}${demoBody(demo)}${demo.closing}
		</div>

		<div class="pg-code">
${codePanelChrome({ scenario: `${demo.family}/${demo.stem}`, panes, bar: scenarioBar(emit, presets), indent: '\t\t\t' })}
		</div>
${docsMarkup('\t\t')}

		<style>
${input.chromeCss}

${input.colourCss}

${docRules(docs.map((doc) => doc.n), '.pg')}

${demo.css}
		</style>
	</section>
}
`;
}

export { displaySource, componentName, identifier };
