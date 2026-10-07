import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const modal: FamilyMeta = {
	family: 'modal',
	partOrder: ['root', 'trigger', 'backdrop', 'content', 'title', 'description', 'close'],
	quick: [{ part: 'root', prop: 'alert' }],
	showAll: [{ part: 'root', prop: 'onChange' }],
	presets: [
		{ name: 'basic', label: 'Basic', values: { alert: 'false' } },
		{ name: 'alert', label: 'Alert', values: { alert: 'true' } },
	],
	keyboard: [
		{ caps: [keys.tab], does: 'Move focus through the dialog. Focus never leaves it.' },
		{ caps: [keys.escape], does: 'Close the dialog and focus the trigger again.' },
	],
	examples: [],
};

export default modal;
