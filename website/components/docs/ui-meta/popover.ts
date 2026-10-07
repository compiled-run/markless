import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const popover: FamilyMeta = {
	family: 'popover',
	partOrder: ['root', 'trigger', 'content', 'title', 'description', 'close'],
	quick: [{ part: 'root', prop: 'open' }],
	showAll: [{ part: 'root', prop: 'onChange' }],
	presets: [
		{ name: 'basic', label: 'Basic', values: { open: 'false' } },
		{ name: 'open', label: 'Starts open', values: { open: 'true' } },
	],
	keyboard: [
		{ caps: [keys.enter, keys.space], join: 'or', does: 'Open or close the panel from the trigger.' },
		{ caps: [keys.escape], does: 'Close the panel. Focus inside it goes back to the trigger.' },
	],
	examples: [],
};

export default popover;
