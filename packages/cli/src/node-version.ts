/** The Node.js versions a new app's build tools accept: vite-plus's `engines.node`, pinned by a test. */
export const SUPPORTED_NODE = [
	{ major: 22, minor: 18 },
	{ major: 24, minor: 11 },
	{ major: 26, minor: 0, orNewer: true },
] as const;

export const SUPPORTED_NODE_RANGE = '^22.18.0 || ^24.11.0 || >=26.0.0';

/** Why this Node.js cannot run a new app, or null when it can. Bun and Deno report a Node.js version but run the app themselves. */
export function unsupportedNode(versions: { node: string; bun?: string; deno?: string }): string | null {
	if (versions.bun || versions.deno) return null;
	const version = versions.node;
	const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number);
	const fits = SUPPORTED_NODE.some((line) =>
		'orNewer' in line
			? major > line.major || (major === line.major && minor >= line.minor)
			: major === line.major && minor >= line.minor,
	);
	if (fits) return null;
	return `Markless needs Node.js 22.18+, 24.11+ or 26+, and this is ${version.replace(/^v?/, 'v')}. Install the latest LTS from https://nodejs.org, then run this again.`;
}
