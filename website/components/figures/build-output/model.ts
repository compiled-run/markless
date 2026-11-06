// The presets the build figure switches between, what each output file is for, and what the live region says.
export type Preset = 'node' | 'vercel' | 'cloudflare';
export const PRESETS: readonly Preset[] = ['node', 'vercel', 'cloudflare'];
export const LABEL: Record<Preset, string> = { node: 'Node', vercel: 'Vercel', cloudflare: 'Cloudflare' };
/** What NITRO_PRESET is set to for each host; the default build needs none. */
export const ENV: Record<Preset, string> = { node: 'node-server', vercel: 'vercel', cloudflare: 'cloudflare-module' };

/** What the host does with each output file, five words at most. */
export const HINTS = {
	'node-server': 'Node runs this server',
	'node-build': 'served as static files',
	'vercel-func': 'runs as a function',
	'vercel-static': 'served from the CDN',
	'vercel-config': 'tells Vercel the routes',
	'cf-worker': 'runs as the Worker',
	'cf-wrangler': 'wrangler deploys with this',
	'cf-public': 'served free, no Worker',
	'cf-headers': 'headers for those files',
} as const;
export type Hint = keyof typeof HINTS | '';

export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const nextPreset = (p: Preset, by: number): Preset => PRESETS[(PRESETS.indexOf(p) + by + PRESETS.length) % PRESETS.length]!;

export function describeBuild(p: Preset): string {
	return `Built for ${LABEL[p]}. Your source files did not change; only the output folder took ${LABEL[p]}'s shape.`;
}

export const REFUSED = 'It slid back. You never edit the output: the build writes it from your source.';
