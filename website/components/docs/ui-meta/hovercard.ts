import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const hovercard: FamilyMeta = {
	family: 'hovercard',
	partOrder: ['root', 'trigger', 'content'],
	quick: [
		{ part: 'root', prop: 'delay' },
		{ part: 'root', prop: 'closeDelay' },
	],
	showAll: [
		{ part: 'root', prop: 'open' },
		{ part: 'root', prop: 'onChange' },
	],
	overrides: [
		{ part: 'root', prop: 'delay', options: ['0', '300', '700', '1500'] },
		{ part: 'root', prop: 'closeDelay', options: ['0', '300', '1000'] },
	],
	presets: [
		{ name: 'basic', label: 'Basic', values: { delay: '700', closeDelay: '300', open: 'false' } },
		{ name: 'quick', label: 'No wait', values: { delay: '0', closeDelay: '0', open: 'false' } },
		{ name: 'pinned', label: 'Pinned open', values: { delay: '700', closeDelay: '300', open: 'true' } },
	],
	keyboard: [
		{ caps: [keys.tab], does: 'Focus the link, and after the delay show the card. Tab again to move into it.' },
		{ caps: [keys.escape], does: 'Hide the card. Focus inside it goes back to the link.' },
	],
	examples: [],
};

export default hovercard;
