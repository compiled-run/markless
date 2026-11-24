import { parse as parseCss } from 'yuku-css';

type CssTreeNode = {
	readonly type: string;
	readonly name?: string;
	readonly property?: string;
	readonly value?: unknown;
	readonly children?: readonly CssTreeNode[] | null;
	readonly block?: CssTreeNode | null;
};

/** Each url() an `@font-face` rule's `src` names, decoded as the CSS spells it, in order and once each. */
export function fontFaceSources(css: string): ReadonlyArray<string> {
	const { ast } = parseCss(css);
	const urls = new Set<string>();
	const visit = (nodes: readonly CssTreeNode[] | null | undefined, inFontFace: boolean): void => {
		for (const node of nodes ?? []) {
			if (node.type === 'Atrule')
				visit(node.block?.children, node.name?.toLowerCase() === 'font-face');
			else if (node.type === 'Rule') visit(node.block?.children, false);
			else if (inFontFace && node.type === 'Declaration' && node.property?.toLowerCase() === 'src')
				for (const part of (node.value as CssTreeNode | undefined)?.children ?? [])
					if (part.type === 'Url' && typeof part.value === 'string') urls.add(part.value);
		}
	};
	visit((ast as unknown as CssTreeNode).children, false);
	return [...urls];
}
