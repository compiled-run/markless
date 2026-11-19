import { parse } from 'yuku-css';

// The last copy beats everything an earlier one beat (same condition, layer and specificity, later in order), as the last @font-face, @keyframes or @property does.
const LAST_WINS_AT_RULES = new Set(['font-face', 'keyframes', '-webkit-keyframes', 'property']);
const CONDITION_GROUPS = new Set(['media', 'supports', 'container', 'scope']);

type CssNode = {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly name?: string;
	readonly prelude?: CssNode | null;
	readonly block?: { readonly children: readonly CssNode[] } | null;
};

/** Rewrites each emitted stylesheet without the earlier copies of its repeated rules. */
export function dropRepeatedStylesheetRules(bundle: Record<string, unknown>): void {
	for (const output of Object.values(bundle)) {
		const asset = output as { type?: unknown; fileName?: unknown; source?: unknown };
		if (asset.type !== 'asset' || typeof asset.fileName !== 'string' || !asset.fileName.endsWith('.css'))
			continue;
		const css =
			typeof asset.source === 'string'
				? asset.source
				: asset.source instanceof Uint8Array
					? new TextDecoder().decode(asset.source)
					: undefined;
		if (css === undefined) continue;
		const next = withoutRepeatedRules(css);
		if (next !== css) asset.source = next;
	}
}

/** A stylesheet without the earlier copies of a rule repeated in the same condition and layer. */
export function withoutRepeatedRules(css: string): string {
	const { ast, diagnostics } = parse(css, {
		parseRulePrelude: false,
		parseValue: false,
		parseAtrulePrelude: false,
	});
	if (diagnostics.length > 0) return css;
	const lastCopy = new Map<string, CssNode>();
	const copies: Array<{ readonly key: string; readonly node: CssNode }> = [];
	let anonymousLayers = 0;
	const collect = (children: readonly CssNode[], context: string) => {
		for (const node of children) {
			const name = node.type === 'Atrule' ? node.name!.toLowerCase() : undefined;
			if (node.type === 'Atrule' && node.block && name !== undefined) {
				if (name === 'layer' || CONDITION_GROUPS.has(name)) {
					const prelude = node.prelude
						? css.slice(node.prelude.start, node.prelude.end)
						: `#${anonymousLayers++}`;
					collect(node.block.children, `${context}@${name} ${prelude}{`);
					continue;
				}
				if (!LAST_WINS_AT_RULES.has(name)) continue;
			} else if (node.type !== 'Rule') continue;
			const key = `${context}\u0000${css.slice(node.start, node.end)}`;
			lastCopy.set(key, node);
			copies.push({ key, node });
		}
	};
	collect(ast.children as readonly CssNode[], '');
	const dropped = new Set(
		copies.filter(({ key, node }) => lastCopy.get(key) !== node).map(({ node }) => node),
	);
	if (dropped.size === 0) return css;
	const ranges: Array<readonly [number, number]> = [];
	// An emptied condition group goes; an emptied layer block stays, as it sets the layer order.
	const prune = (children: readonly CssNode[]): boolean => {
		let kept = false;
		for (const node of children) {
			if (dropped.has(node)) {
				ranges.push([node.start, node.end]);
				continue;
			}
			const name = node.type === 'Atrule' ? node.name!.toLowerCase() : undefined;
			if (node.block && name !== undefined && (name === 'layer' || CONDITION_GROUPS.has(name))) {
				const start = ranges.length;
				if (!prune(node.block.children) && name !== 'layer') {
					ranges.length = start;
					ranges.push([node.start, node.end]);
					continue;
				}
			}
			kept = true;
		}
		return kept;
	};
	prune(ast.children as readonly CssNode[]);
	let out = '';
	let at = 0;
	for (const [start, end] of ranges) {
		out += css.slice(at, start);
		at = end;
	}
	return out + css.slice(at);
}
