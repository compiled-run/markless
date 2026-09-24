export const profiles = {
	normal: {
		network: { name: 'unthrottled', downloadKbps: null, uploadKbps: null, latencyMs: null },
		cpu: { name: 'unthrottled', slowdown: 1 },
	},
	constrained: {
		network: { name: 'rtt150-down5mbps-up1mbps', downloadKbps: 5000, uploadKbps: 1000, latencyMs: 150 },
		cpu: { name: '4x-slowdown', slowdown: 4 },
	},
};

export function selectProfiles(names) {
	return names.map((name) => {
		if (!profiles[name]) throw new Error(`unknown profile "${name}" (known: ${Object.keys(profiles).join(', ')})`);
		return { name, ...profiles[name] };
	});
}

export const NETWORK_SHAPING = ['proxy', 'cdp'];
const hasNetworkShaping = (network) => network.latencyMs != null || network.downloadKbps != null || network.uploadKbps != null;

/**
 * What a visit actually applies. Network: the proxy's shaped listener for both browsers (default), or
 * CDP emulation in Chromium with `cdp`; the method is suffixed to network.name. CPU: CDP, so Chromium only.
 */
export function appliedProfile(profile, browserName, networkShaping = 'proxy') {
	const cdp = browserName === 'chromium';
	const networkMethod = !hasNetworkShaping(profile.network) ? null : networkShaping === 'cdp' && cdp ? 'cdp' : 'proxy';
	const cpuApplied = profile.cpu.slowdown === 1 || cdp;
	return {
		name: profile.name,
		networkMethod,
		network: networkMethod ? { ...profile.network, name: `${profile.network.name}@${networkMethod}` } : profile.network,
		cpu: cpuApplied ? profile.cpu : { name: 'unthrottled-no-cdp', slowdown: 1 },
		cpuNotApplied: cpuApplied ? null : { requested: profile.cpu, reason: `${browserName} has no CDP, so CPU throttling cannot be applied; the visit runs at full CPU speed` },
	};
}

export const needsShapedListener = (profile) => hasNetworkShaping(profile.network);
