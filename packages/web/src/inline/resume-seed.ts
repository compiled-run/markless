/**
 * Runs inline after a streamed shell, before its first paint: each pending block with a matching
 * resume cache entry queues the entry's settled arm through the stream executor, so the block shows
 * the content this tab last saw while the stream and the runtime revalidate it.
 */
export function runResumeCacheSeed(
	prefix: string,
	scope: string,
	build: string,
	tryArm: number,
	seededAttribute: string,
	items: ReadonlyArray<readonly [boundaryId: string, graphNodeId: string, dependencyKey: string]>,
): void {
	const d = document;
	const arm = (globalThis as { __mArm?: (id: string, deps: ReadonlyArray<string>) => void }).__mArm;
	let storage: Storage;
	try {
		storage = sessionStorage;
	} catch {
		return;
	}
	const script = (type: string, attribute: string, value: string, json: string) => {
		const element = d.createElement('script');
		element.type = type;
		element.setAttribute(attribute, value);
		element.setAttribute('data-seeded', '');
		element.textContent = json;
		d.body.append(element);
	};
	for (const [boundaryId, graphNodeId, dependencyKey] of items) {
		const name = [prefix, scope, build, location.pathname, boundaryId].join(':');
		let entry: { k?: unknown; h?: unknown; a?: unknown; s?: unknown } | null;
		try {
			const raw = storage.getItem(name);
			if (!raw) continue;
			entry = JSON.parse(raw);
		} catch {
			try {
				storage.removeItem(name);
			} catch {}
			continue;
		}
		if (!arm || !entry || entry.k !== dependencyKey || typeof entry.h !== 'string' || !entry.a || !entry.s)
			continue;
		const template = d.createElement('template');
		template.setAttribute('m:arm', boundaryId);
		template.innerHTML = entry.h;
		for (const element of Array.from(template.content.children)) element.setAttribute(seededAttribute, '');
		d.body.append(template);
		script('markless/arm', 'data-boundary', boundaryId, JSON.stringify([tryArm, entry.a]));
		script('markless/state-patch', 'data-graph-node', graphNodeId, JSON.stringify(entry.s));
		arm(boundaryId, []);
	}
}
