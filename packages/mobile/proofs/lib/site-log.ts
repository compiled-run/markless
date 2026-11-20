/** The log, as JSON, with one more entry numbered in base 36 from 35 (`z`, then `10`), and the log as one line. */
export function addSite(log: string, site: string): { log: string; id: string; line: string } {
	const entries = JSON.parse(log) as { readonly id: string; readonly site: string }[];
	const id = (entries.length + 35).toString(36);
	const next = JSON.stringify([...entries, { id, site }]);
	return {
		log: next,
		id,
		line: (JSON.parse(next) as typeof entries)
			.map((entry) => `${entry.id} ${entry.site}`)
			.join(', '),
	};
}
