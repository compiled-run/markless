import { PROTOCOL_PROPERTY_ONLY_MEMBERS } from '../../serializer/src/protocol-dom-properties.ts';
import { endOfTag, servedElementTree } from './locator-paths.ts';

/** One element's member to set: its element-child steps from the container, the property, its value. */
export type PropertySeed = readonly [
	path: ReadonlyArray<number>,
	name: string,
	value: boolean | number,
];

// A srcObject has no served value; every other member is numeric except indeterminate.
const SEEDED = PROTOCOL_PROPERTY_ONLY_MEMBERS.filter((name) => name !== 'srcObject');
const BY_LOWER = new Map(SEEDED.map((name) => [name.toLowerCase(), name]));
const ANY = new RegExp(`<[a-z][^<>]*\\s(?:${SEEDED.join('|')})(?:[\\s=/>]|$)`, 'i');
const ATTRIBUTE = /\s([^\s"'=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;

/**
 * The served html without its property-only attributes, and the values they carried, addressed by
 * element position; undefined when the html carries none, so a page without them is untouched.
 */
export function servedPropertySeeds(
	html: string,
): { readonly html: string; readonly seeds: ReadonlyArray<PropertySeed> } | undefined {
	if (!ANY.test(html)) return undefined;
	const { elements, nameEnds } = servedElementTree(html);
	const seeds: PropertySeed[] = [];
	const cuts: Array<readonly [number, number]> = [];
	for (let index = 1; index < elements.length; index++) {
		const start = nameEnds[index]!;
		const tag = html.slice(start, endOfTag(html, start));
		for (const match of tag.matchAll(ATTRIBUTE)) {
			const name = BY_LOWER.get(match[1]!.toLowerCase());
			if (!name) continue;
			const raw = match[2]?.replace(/^["']|["']$/g, '') ?? '';
			const path: number[] = [];
			for (let at = index; at > 0; at = elements[at]!.parent)
				path.unshift(elements[at]!.child);
			seeds.push([path, name, name === 'indeterminate' ? true : Number(raw)]);
			cuts.push([start + match.index!, start + match.index! + match[0].length]);
		}
	}
	if (seeds.length === 0) return undefined;
	let out = '';
	let cursor = 0;
	for (const [from, to] of cuts) {
		out += html.slice(cursor, from);
		cursor = to;
	}
	return { html: out + html.slice(cursor), seeds };
}

// Runs in the page as text, so it is written small by hand: set each seeded element's property.
export const APPLY_PROPERTY_SEEDS_SOURCE =
	'(r,s)=>{for(const[p,n,v]of s){let e=r;for(const i of p)e=e&&e.children[i];if(e&&e!==r)e[n]=v}}';

// A streamed arm's markup waits in a template until its commit moves it into the page, which may come
// before or after the resume code: whoever reads the template's content gets it, and once that read has
// moved the nodes into place, a microtask sets each seeded property on its element.
export const STREAMED_ARM_PROPERTY_SEEDS_SOURCE =
	'(i,s)=>{const t=document.querySelector(\'template[m\\\\:arm="\'+i+\'"]\'),c=t.content,l=s.map(([p,n,v])=>{let e=c;for(const x of p)e=e&&e.children[x];return[e,n,v]});Object.defineProperty(t,"content",{get(){queueMicrotask(()=>{for(const[e,n,v]of l)if(e&&e!==c)e[n]=v});return c}})}';

/**
 * For a settle template (an arm, row or empty arm the page fills in the browser), each element carrying a
 * property-only member: as a constant attribute in the markup, or as a hole the filler writes as an attribute.
 */
export function templatePropertySeeds(
	html: string,
	holes: ReadonlyArray<{
		readonly coordinate: number;
		readonly kind: string;
		readonly name?: string;
	}>,
): ReadonlyArray<readonly [path: ReadonlyArray<number>, name: string]> {
	const holeNames = holes.flatMap((hole) =>
		hole.kind === 'attribute' && hole.name && BY_LOWER.has(hole.name.toLowerCase())
			? [[hole.coordinate, BY_LOWER.get(hole.name.toLowerCase())!] as const]
			: [],
	);
	if (holeNames.length === 0 && !ANY.test(html)) return [];
	const { elements, nameEnds } = servedElementTree(html);
	const pathOf = (index: number) => {
		const path: number[] = [];
		for (let at = index; at > 0; at = elements[at]!.parent) path.unshift(elements[at]!.child);
		return path;
	};
	const seeds: Array<readonly [ReadonlyArray<number>, string]> = [];
	for (let index = 1; index < elements.length; index++) {
		const start = nameEnds[index]!;
		const tag = html.slice(start, endOfTag(html, start));
		for (const match of tag.matchAll(ATTRIBUTE)) {
			const name = BY_LOWER.get(match[1]!.toLowerCase());
			if (name) seeds.push([pathOf(index), name]);
		}
		const open = html.lastIndexOf('<', start);
		for (const [coordinate, name] of holeNames)
			if (html.endsWith(`<!--mh:${coordinate}-->`, open)) seeds.push([pathOf(index), name]);
	}
	return seeds;
}

// The filler clones a settle template, fills its holes and moves the clone into the page; once that has
// happened, a microtask moves each seeded element's attribute onto its property.
export const SETTLE_TEMPLATE_PROPERTY_SEEDS_SOURCE =
	'(i,s)=>{for(const[k,l]of s){const t=document.querySelector(\'template[m\\\\:\'+k+\'="\'+i+\'"]\');if(!t)continue;const c=t.content,o=c.cloneNode;c.cloneNode=function(d){const f=o.call(this,d),r=l.map(([p,n])=>{let e=f;for(const x of p)e=e&&e.children[x];return[e,n]});queueMicrotask(()=>{for(const[e,n]of r){const v=e&&e!==f&&e.getAttribute(n);if(v==null||v===false)continue;e.removeAttribute(n);e[n]=n==="indeterminate"?v!=="false":Number(v)}});return f}}}';
