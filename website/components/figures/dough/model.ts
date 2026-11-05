// The values the dough figure shows, its tour and the sentence its live region speaks.
export type Preset = 'node' | 'vercel' | 'cloudflare';

/** The tin each preset bakes in: its label and what comes out of it. */
export const TINS = {
	node: { name: 'Node', out: 'one server in .output/' },
	vercel: { name: 'Vercel', out: 'static files and functions in .vercel/output/' },
	cloudflare: { name: 'Cloudflare', out: 'a Worker and static files in .output/' },
} as const;

export const ORDER: readonly Preset[] = ['node', 'vercel', 'cloudflare'];
export const next = (preset: Preset): Preset => ORDER[(ORDER.indexOf(preset) + 1) % ORDER.length]!;
export const previous = (preset: Preset): Preset => ORDER[(ORDER.indexOf(preset) + ORDER.length - 1) % ORDER.length]!;

/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const DOUGH_TOUR = ['switch', 'rest', 'rest'] as const;

export function describeDough(preset: Preset, poked: boolean): string {
	if (poked) return 'Poked the dough. It is the same dough, whichever tin it goes into.';
	return `Switched to the ${TINS[preset].name} tin. The same dough came out as ${TINS[preset].out}.`;
}
