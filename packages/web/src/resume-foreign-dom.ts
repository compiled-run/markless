import { PROTOCOL_LOCATOR_PATHS_ATTRIBUTE } from '../../serializer/src/protocol-locator-paths.ts';
import { decodeLocatorPaths, servedPageChildren } from './fns/served-census-repair.ts';
import type { ResumeDomElement } from './resume-types.ts';

type ForeignRoot = ResumeDomElement & {
	readonly getAttribute?: (name: string) => string | null;
	readonly children?: ArrayLike<ResumeDomElement>;
};

/** Dev only: where a located element went, for a resume error to say who moved it. */
export function describeForeignChange(
	root: ResumeDomElement,
	census: ReadonlyArray<ResumeDomElement | null>,
	index: number,
	found: ResumeDomElement | null | undefined,
): string {
	const value = (root as ForeignRoot).getAttribute?.(PROTOCOL_LOCATOR_PATHS_ATTRIBUTE);
	if (!value) return '';
	if (found)
		return ` A script outside Markless put ${describeNode(found)} there (at ${selectorOf(root, found)}) before the page woke; that element is left alone and the rest of the page still resumes.`;
	const entry = decodeLocatorPaths(value).entries.find((item) => item.index === index);
	if (!entry) return '';
	const { parent: parentIndex, child } = entry;
	const parent = census[parentIndex];
	if (!parent) return '';
	const standIn = (
		parentIndex
			? (parent as ForeignRoot).children
			: (servedPageChildren(root as never) as unknown as ResumeDomElement[])
	)?.[child];
	return standIn && !census.includes(standIn)
		? ` A script outside Markless put ${describeNode(standIn)} in its place (at ${selectorOf(root, standIn)}) before the page woke; that element is left alone and the rest of the page still resumes.`
		: ` A script outside Markless removed or moved it from ${selectorOf(root, parent)} before the page woke; the rest of the page still resumes.`;
}

function describeNode(node: ResumeDomElement): string {
	const element = node as unknown as Element;
	const attributes = Array.from(element.attributes ?? [])
		.slice(0, 3)
		.map((attribute) => ` ${attribute.name}="${attribute.value.slice(0, 40)}"`)
		.join('');
	return `<${element.localName ?? node.tagName.toLowerCase()}${attributes}>`;
}

function selectorOf(root: ResumeDomElement, node: ResumeDomElement): string {
	const steps: string[] = [];
	for (
		let at: ResumeDomElement | null | undefined = node;
		at && at !== root;
		at = at.parentElement
	) {
		const siblings = Array.from(
			(at.parentElement as ForeignRoot | null | undefined)?.children ?? [],
		);
		steps.unshift(
			`${at.tagName.toLowerCase()}:nth-child(${siblings.indexOf(at as never) + 1})`,
		);
	}
	return steps.join(' > ') || 'the container';
}
