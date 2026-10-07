import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const carousel: FamilyMeta = {
	family: 'carousel',
	partOrder: [
		'root',
		'title',
		'scrollarea',
		'item',
		'backtrigger',
		'forwardtrigger',
		'navlist',
		'navtrigger',
		'playtrigger',
	],
	quick: [
		{ part: 'root', prop: 'rewind' },
		{ part: 'root', prop: 'loop' },
		{ part: 'root', prop: 'draggable' },
	],
	showAll: [
		{ part: 'root', prop: 'mousewheel' },
		{ part: 'root', prop: 'onChange' },
	],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: { rewind: 'false', loop: 'false', draggable: 'true', mousewheel: 'false' },
		},
		{
			name: 'rewind',
			label: 'Rewind',
			values: { rewind: 'true', loop: 'false', draggable: 'true', mousewheel: 'false' },
		},
		{
			name: 'loop',
			label: 'Loop',
			values: { rewind: 'false', loop: 'true', draggable: 'true', mousewheel: 'false' },
		},
	],
	keyboard: [
		{
			caps: [keys.left, keys.right],
			join: 'or',
			does: 'On a picker, show the previous or next slide and focus its picker.',
		},
		{
			caps: [keys.home, keys.end],
			join: 'or',
			does: 'On a picker, show the first or last slide.',
		},
		{
			caps: [keys.enter, keys.space],
			join: 'or',
			does: 'Press the focused back or forward trigger.',
		},
	],
	examples: [],
};

export default carousel;
