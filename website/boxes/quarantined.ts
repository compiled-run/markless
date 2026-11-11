// The website boxes CI skips, mirrored in docs/ci-process.md "Quarantined tests". An entry past its expiry fails its box.
const quarantined: Record<string, { owner: string; expires: string; reason: string }> = {
	'sidebar-open-sections': {
		owner: 'markless PM (async-dx session)',
		expires: '2026-11-18',
		reason: "a kept part's handler write is lost when the handler's code is cold (fix: T030)",
	},
};

/** True while `name` is quarantined; throws once its entry has expired. */
export function skipWhileQuarantined(name: string, today = new Date().toISOString().slice(0, 10)) {
	const entry = quarantined[name];
	if (!entry) return false;
	if (today > entry.expires)
		throw new Error(
			`The quarantine of ${name} expired on ${entry.expires} (owner ${entry.owner}): fix the box or renew the entry in docs/ci-process.md.`,
		);
	console.warn(`quarantined until ${entry.expires} (owner ${entry.owner}): ${entry.reason}`);
	return true;
}
