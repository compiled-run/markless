import type { AnatomyScene } from './scenes.ts';

type Composition = string | readonly [string, ...Composition[]];

export const compositions: Readonly<Record<string, Composition>> = {
	accordion: ['root', ['item', ['itemlabel', 'itemtrigger'], 'itemcontent']],
	collapsible: ['root', 'trigger', 'content'],
	tabs: ['root', ['list', 'trigger', 'trigger', 'trigger'], 'content'],
	toggle: ['root', 'label', ['trigger', 'thumb'], 'description'],
	checkbox: ['root', ['trigger', 'indicator'], 'label', 'description'],
	radiogroup: ['root', 'label', ['item', ['itemtrigger', 'itemindicator'], 'itemlabel'], ['item', 'itemtrigger', 'itemlabel']],
	textbox: ['root', 'label', 'input', 'description'],
	select: ['root', 'label', 'trigger', ['content', ['item', 'itemlabel', 'itemindicator'], 'item', 'item']],
	combobox: ['root', 'label', 'input', 'trigger', ['content', ['item', 'itemlabel', 'itemindicator'], 'item', 'item']],
	modal: ['root', 'trigger', ['backdrop', ['content', 'title', 'description', 'close']]],
	drawer: ['root', 'trigger', ['backdrop', ['content', 'title', 'description', 'close']]],
	popover: ['root', 'trigger', ['content', 'title', 'description', 'close']],
	hovercard: ['root', 'trigger', 'content'],
	tooltip: ['root', 'trigger', 'content'],
	progress: ['root', 'label', 'valuelabel', ['track', 'indicator']],
	otp: ['root', 'item', 'item', 'item', ['item', 'itemindicator'], 'item', 'item'],
	navbar: ['root', ['item', 'itemlink'], ['item', 'itemtrigger', 'itemcontent']],
	pagination: ['root', 'backtrigger', ['item', 'itemtrigger'], ['item', 'itemtrigger'], ['item', 'itemlink'], 'forwardtrigger'],
	tree: ['root', 'label', ['item', ['itemtrigger', 'itemlabel'], ['itemcontent', ['item', 'itemlabel', 'itemindicator'], 'item']]],
	checklist: ['root', 'label', ['selectall', 'selectallindicator'], ['item', ['itemtrigger', 'itemindicator'], 'itemlabel', 'itemdescription'], 'item'],
	gridlist: ['root', 'label', ['item', ['itemtrigger', 'itemindicator'], 'itemlabel', 'itemcontent'], 'item'],
	table: ['root', 'coltrigger', 'coltrigger', ['item', 'itemcontent', 'itemcontent'], ['item', 'itemcontent', 'itemcontent']],
	resizable: ['root', 'item', 'thumb', 'item'],
	carousel: ['root', 'title', ['scrollarea', 'item', 'item'], 'backtrigger', 'forwardtrigger', ['navlist', 'navtrigger', 'navtrigger', 'navtrigger'], 'playtrigger'],
	toaster: ['root', ['item', 'itemicon', 'itemtitle', 'itemdescription', 'itemclose'], 'item'],
	qrcode: ['root', ['frame', ['patternsvg', 'patternpath'], 'overlay']],
};

export type AnatomyNode = {
	readonly id: string;
	readonly part: string;
	readonly label: string;
	readonly name: string;
	readonly shapeId: string;
	readonly level: number;
	readonly children: readonly AnatomyNode[];
};

export function hierarchyFor(family: string, scene: AnatomyScene): AnatomyNode {
	const composition = compositions[family];
	if (!composition) throw new Error(`Anatomy: ${family} needs an authored composition.`);
	const used = new Map<string, number>();
	const build = (entry: Composition, level: number): AnatomyNode => {
		const [part, ...children] = typeof entry === 'string' ? [entry] : entry;
		const occurrence = used.get(part) ?? 0;
		used.set(part, occurrence + 1);
		const matches = scene.shapes.map((shape, index) => ({ shape, index })).filter(({ shape }) => shape.part === part);
		const match = matches[occurrence];
		if (!match) throw new Error(`Anatomy: ${family}.${part} instance ${occurrence + 1} has no drawing.`);
		const suffix = matches.length > 1 && part !== 'patternpath' ? ` ${occurrence + 1}` : '';
		return {
			id: `${family}-node-${match.index}`,
			part,
			label: level === 1 ? `${family}.${part}` : part + suffix,
			name: `${family}.${part}${suffix}`,
			shapeId: `${family}-${match.index}`,
			level,
			children: children.map((child) => build(child, level + 1)),
		};
	};
	return build(composition, 1);
}
