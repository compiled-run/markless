/** The Node.js versions a new app's build tools accept: vite-plus's `engines.node`, pinned by a test. */
export const SUPPORTED_NODE = [
	{ major: 20, minor: 19 },
	{ major: 22, minor: 18 },
	{ major: 24, minor: 11, orNewer: true },
] as const;

export const SUPPORTED_NODE_RANGE = '^20.19.0 || ^22.18.0 || >=24.11.0';

/** Why this Node.js cannot run a new app, or null when it can. */
export function unsupportedNode(version: string): string | null {
	const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number);
	const fits = SUPPORTED_NODE.some((line) =>
		'orNewer' in line
			? major > line.major || (major === line.major && minor >= line.minor)
			: major === line.major && minor >= line.minor,
	);
	if (fits) return null;
	return `Markless needs Node.js 20.19+, 22.18+ or 24.11+, and this is ${version.replace(/^v?/, 'v')}. Install the latest LTS from https://nodejs.org, then run this again.`;
}
