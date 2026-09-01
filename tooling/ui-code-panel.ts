// A standalone code panel is generated the way the playground card is: one
// TSRX module per demo, written to disk, drawing the highlighter's runs from a
// constant table inside the shared tabs-and-clamp chrome.
//
// The runs are data and not literal markup on purpose. A keyed repeat over a
// module constant is server-only (no payload), and its template hosts are
// located once; literal spans are each a located host, which measured at ~78
// payload bytes per token. The shape is shiki's own — one span per run, no
// wrapper — with each colour pair hoisted to a short class, and every distinct
// hover doc written once in a registry the spans point at by key.
import { highlightFences } from './highlight-code.ts';
import { CODE_CSS, CODE_PANEL_CSS, docRules } from './ui-playground-css.ts';
import { GENERATED_DIR, codePanelChrome, identifier, type ChromePane } from './ui-playground.ts';

/** Where the generated module for one demo's code panel is written. */
export function codePanelPath(root: string, family: string, stem: string): string {
	return `${root.replace(/\/$/, '')}/${GENERATED_DIR}/${family}__${stem}__code.tsrx`;
}

export function codePanelName(family: string, stem: string): string {
	return `${identifier(family)}${identifier(stem)}Code`;
}

/** One file of the demo, as the panel shows it. */
export type PanelPane = {
	readonly value: string;
	/** What the tab strip shows — the file's own name. */
	readonly label: string;
	readonly code: string;
	readonly language: string;
};

const ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	nbsp: ' ',
	quot: '"',
};

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
		if (body.startsWith('#x') || body.startsWith('#X'))
			return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
		if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
		return ENTITIES[body.toLowerCase()] ?? match;
	});
}

function escapeHtml(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const TAG_OR_TEXT = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|[^">])*)>|([^<]+)/g;
const ATTRIBUTE = /([\w:-]+)="([^"]*)"/g;

/** One span the panel draws. The hover fields are set on a documented token only. */
type Run = {
	readonly id: string;
	readonly text: string;
	readonly class?: string;
	readonly tabindex?: string;
	readonly role?: string;
	readonly labelledby?: string;
	readonly describedby?: string;
	readonly doc?: string;
};

type Line = { readonly id: string; readonly runs: readonly Run[] };

type Doc = { readonly id: string; readonly n: string; readonly t: string; readonly b: string; readonly title: string; readonly doc: string };

/** Every distinct hover doc of one panel, numbered in order of first use. */
class DocRegistry {
	readonly docs: Doc[] = [];
	private readonly byText = new Map<string, Doc>();
	private readonly idPrefix: string;

	constructor(idPrefix: string) {
		this.idPrefix = idPrefix;
	}

	entry(title: string, doc: string): Doc {
		const key = `${title} ${doc}`;
		let found = this.byText.get(key);
		if (!found) {
			const n = String(this.docs.length);
			found = { id: `d${n}`, n, t: `${this.idPrefix}-${n}t`, b: `${this.idPrefix}-${n}b`, title, doc };
			this.docs.push(found);
			this.byText.set(key, found);
		}
		return found;
	}
}

/** Every distinct colour pair of one panel as a class, so a run carries two bytes of class and not fifty of style. */
class ColourTable {
	private readonly byStyle = new Map<string, string>();

	classFor(style: string): string | undefined {
		if (style === '') return undefined;
		let name = this.byStyle.get(style);
		if (!name) {
			name = `c${this.byStyle.size}`;
			this.byStyle.set(style, name);
		}
		return name;
	}

	css(): string {
		return [...this.byStyle]
			.map(([style, name]) => `			.${name} {\n				${style.split(';').filter(Boolean).join(';\n				')};\n			}`)
			.join('\n\n');
	}
}

type Frame = { readonly kind: 'line' | 'span' | 'tip'; readonly style: string; readonly hover?: Doc };

type Draft = { text: string; style: string; readonly hover?: Doc };

/**
 * The `<code>` body the highlighter wrote, as one flat run list per line: shiki's
 * spans as they are, a documented token as its own run keyed into the registry,
 * and the tip copy of the token dropped. Whitespace-only runs fold into a
 * neighbour and same-coloured neighbours fold together, so the served markup
 * is one span per coloured run.
 */
function paneLines(html: string, registry: DocRegistry, colours: ColourTable): Line[] {
	const opened = html.indexOf('<code');
	const start = opened < 0 ? -1 : html.indexOf('>', opened);
	const end = html.lastIndexOf('</code>');
	const body = start < 0 || end < 0 ? html : html.slice(start + 1, end);
	return body.split('\n').map((raw, lineIndex) => {
		const stack: Frame[] = [{ kind: 'line', style: '' }];
		const drafts: Draft[] = [];
		TAG_OR_TEXT.lastIndex = 0;
		for (const match of raw.matchAll(TAG_OR_TEXT)) {
			const [, closing, , attributes, text] = match;
			const top = stack[stack.length - 1];
			if (text !== undefined) {
				if (top.kind === 'tip') continue;
				drafts.push({ text: decodeEntities(text), style: top.style, hover: top.hover });
				continue;
			}
			if (closing === '/') {
				if (stack.length > 1) stack.pop();
				continue;
			}
			const attrs = new Map<string, string>();
			for (const attribute of (attributes ?? '').matchAll(ATTRIBUTE))
				attrs.set(attribute[1], decodeEntities(attribute[2]));
			const classes = (attrs.get('class') ?? '').split(/\s+/);
			if (top.kind === 'tip' || classes.includes('tsrx-tip')) {
				stack.push({ kind: 'tip', style: top.style });
				continue;
			}
			const hover = classes.includes('tsrx-hover')
				? registry.entry(attrs.get('data-doc-title') ?? '', attrs.get('data-doc') ?? '')
				: top.hover;
			stack.push({ kind: 'span', style: attrs.get('style') ?? top.style, hover });
		}

		// Whitespace folds into the neighbouring plain run; same-coloured plain runs fold together.
		const folded: Draft[] = [];
		for (const draft of drafts) {
			const last = folded[folded.length - 1];
			const blank = draft.text.trim() === '';
			if (draft.hover === undefined && last && last.hover === undefined) {
				const lastBlank = last.text.trim() === '';
				if (last.style === draft.style || blank || lastBlank) {
					if (lastBlank && !blank) last.style = draft.style;
					last.text += draft.text;
					continue;
				}
			}
			folded.push({ ...draft });
		}

		const runs: Run[] = folded
			.filter((draft) => draft.text !== '')
			.map((draft, runIndex) => {
				const run: Run = { id: `r${runIndex}`, text: draft.text };
				const colour = colours.classFor(draft.style);
				if (draft.hover === undefined) return colour === undefined ? run : { ...run, class: colour };
				return {
					...run,
					class: colour === undefined ? 'tsrx-hover' : `tsrx-hover ${colour}`,
					tabindex: '0',
					role: 'img',
					labelledby: draft.hover.t,
					...(draft.hover.doc === '' ? {} : { describedby: draft.hover.b }),
					doc: draft.hover.n,
				};
			});
		return { id: `l${lineIndex}`, runs };
	});
}

/** Runs one file through the site's fence highlighter, so panels and fences are coloured by one pipeline. */
async function highlightHtml(code: string, language: string): Promise<string> {
	const fence = `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
	return highlightFences(fence);
}

function paneMarkup(list: string, indent: string): string {
	return `${indent}@for (const line of ${list}; key line.id) {
${indent}	<span class="pg-line">
${indent}		@for (const run of line.runs; key run.id) {
${indent}			<span class={run.class} tabindex={run.tabindex} role={run.role} aria-labelledby={run.labelledby} aria-describedby={run.describedby} data-doc={run.doc}>{run.text}</span>
${indent}		}
${indent}	</span>
${indent}}`;
}

/** The whole generated module: the run tables, the chrome, the doc registry, the CSS. */
export async function codePanelModule(input: {
	readonly family: string;
	readonly stem: string;
	readonly panes: readonly PanelPane[];
}): Promise<string> {
	const registry = new DocRegistry(`cp-${input.family}-${input.stem}`);
	const colours = new ColourTable();
	const consts: string[] = [];
	const panes: ChromePane[] = [];
	for (const pane of input.panes) {
		const name = `${pane.value}Lines`;
		const lines = paneLines(await highlightHtml(pane.code, pane.language), registry, colours);
		consts.push(`const ${name}: readonly Line[] = ${JSON.stringify(lines)};`);
		panes.push({ value: pane.value, label: pane.label, markup: paneMarkup(name, '\t\t\t\t\t\t\t\t\t') });
	}
	const chrome = codePanelChrome({
		scenario: `${input.family}/${input.stem}`,
		panes,
		indent: '\t\t',
	});
	return `import { collapsible, tabs } from '@markless/ui';

type Run = {
	readonly id: string;
	readonly text: string;
	readonly class?: string;
	readonly tabindex?: string;
	readonly role?: string;
	readonly labelledby?: string;
	readonly describedby?: string;
	readonly doc?: string;
};
type Line = { readonly id: string; readonly runs: readonly Run[] };
type Doc = { readonly id: string; readonly n: string; readonly t: string; readonly b: string; readonly title: string; readonly doc: string };

${consts.join('\n')}
const docs: readonly Doc[] = ${JSON.stringify(registry.docs)};

export default function ${codePanelName(input.family, input.stem)}() @{
	<div class="cp">
${chrome}
		<span class="cp-docs" aria-hidden="true">
			@for (const doc of docs; key doc.id) {
				<span class="cp-doc" data-doc={doc.n}><span class="tsrx-tip-title" id={doc.t}>{doc.title}</span><span class="tsrx-tip-body" id={doc.b}>{doc.doc}</span></span>
			}
		</span>
		<style>
${CODE_CSS}

${CODE_PANEL_CSS}

${colours.css()}

${docRules(registry.docs.length)}
		</style>
	</div>
}
`;
}
