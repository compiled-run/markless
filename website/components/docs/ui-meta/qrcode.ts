import type { FamilyMeta } from './types.ts';

export const qrcode: FamilyMeta = {
	family: 'qrcode',
	quick: [
		{ part: 'root', prop: 'value' },
		{ part: 'root', prop: 'recovery' },
		{
			local: 'logo',
			label: 'Logo',
			doc: 'Lays a qrcode.overlay over the middle of the code. A covered code needs quartile or high recovery.',
		},
	],
	showAll: [],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: { value: 'https://markless.dev', recovery: 'medium', logo: 'false' },
		},
		{
			name: 'logo',
			label: 'With a logo',
			values: { value: 'https://markless.dev', recovery: 'high', logo: 'true' },
		},
		{
			name: 'long',
			label: 'Long link',
			values: {
				value: 'https://markless.dev/ui/qrcode?from=print&campaign=autumn',
				recovery: 'medium',
				logo: 'false',
			},
		},
	],
	keyboard: [],
	examples: [],
};

export default qrcode;
