import type { FamilyMeta } from './types.ts';

export const toaster: FamilyMeta = {
	family: 'toaster',
	quick: [
		{
			local: 'message',
			label: 'Message',
			doc: 'The title toaster.say gives the message. Saying it again with the same id updates the row in place.',
		},
		{
			local: 'tone',
			label: 'Tone',
			doc: 'The tone toaster.say gives the message. An error row is role="alert"; every other tone is role="status".',
			options: ['neutral', 'success', 'warning', 'error'],
		},
	],
	showAll: [],
	presets: [
		{ name: 'saved', label: 'Saved', values: { message: 'Draft saved', tone: 'success' } },
		{
			name: 'warning',
			label: 'Warning',
			values: { message: 'Draft is large', tone: 'warning' },
		},
		{ name: 'error', label: 'Error', values: { message: 'Save failed', tone: 'error' } },
	],
	keyboard: [],
	examples: [],
};

export default toaster;
