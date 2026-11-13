// A load that answers after `ms`; a label starting with "broken" fails. Browser runs are recorded so a test can tell no second load happened.
export const browserLoads: string[] = [];

export function load(label: string, ms: number): Promise<string> {
	if (typeof window !== 'undefined') browserLoads.push(label);
	return new Promise((resolve, reject) =>
		setTimeout(
			() => (label.startsWith('broken') ? reject(new Error(`${label} is down`)) : resolve(`${label} ready`)),
			ms,
		),
	);
}
