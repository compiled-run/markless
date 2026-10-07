import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const tooltip: FamilyMeta = {
	family: 'tooltip',
	partOrder: ['root', 'trigger', 'content'],
	quick: [
		{ part: 'root', prop: 'delay' },
		{ part: 'root', prop: 'open' },
	],
	showAll: [{ part: 'root', prop: 'onChange' }],
	overrides: [{ part: 'root', prop: 'delay', options: ['0', '300', '600', '1200'] }],
	presets: [
		{ name: 'basic', label: 'Basic', values: { delay: '600', open: 'false' } },
		{ name: 'instant', label: 'No wait', values: { delay: '0', open: 'false' } },
		{ name: 'pinned', label: 'Pinned open', values: { delay: '600', open: 'true' } },
	],
	keyboard: [
		{ caps: [keys.tab], does: 'Focus the trigger. The tip shows at once.' },
		{ caps: [keys.escape], does: 'Hide the tip. Focus stays on the trigger.' },
	],
	examples: [],
};

export default tooltip;
