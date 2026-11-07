/**
 * Runs inline in a streamed shell, before its first paint: each pending block with a matching
 * resume cache entry commits the entry's settled arm through the stream executor at once, then the
 * runtime wakes so the block's stream patch, or its own fetch, updates that content in place.
 */
export function runResumeCacheSeed(
	prefix: string,
	scope: string,
	build: string,
	tryArm: number,
	seededAttribute: string,
	seedScriptAttribute: string,
	items: ReadonlyArray<readonly [boundaryId: string, graphNodeId: string, dependencyKey: string]>,
	resumeModuleUrl: string | null,
	dev: boolean,
	loadModule?: (url: string) => Promise<{ resumeContainerEvent(input: object): unknown }>,
): void {
	const d = document;
	const arm = (
		globalThis as { __mArm?: ((id: string, deps: ReadonlyArray<string>) => void) & { flush(): void } }
	).__mArm;
	const root = d.currentScript?.closest('[data-async-container]') as
		| (Element & {
				__asyncResumeRuntimeStarted?: boolean;
				__marklessDelegatedDispatch?: boolean | string;
				__mResume?: Promise<{ resumeContainerEvent(input: object): unknown }>;
				__mL?: object;
		  })
		| null
		| undefined;
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
		element.setAttribute(seedScriptAttribute, '');
		element.textContent = json;
		d.body.append(element);
	};
	const log = (message: string) => dev && console.info(`[markless] resume cache ${message}`);
	let seeded = false;
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
			log(`skipped ${boundaryId}: malformed-purged (${name})`);
			continue;
		}
		if (!arm || !entry || typeof entry.h !== 'string' || !entry.a || !entry.s) {
			log(`skipped ${boundaryId}: no settled arm to show (${name})`);
			continue;
		}
		if (entry.k !== dependencyKey) {
			log(`skipped ${boundaryId}: dependency-key-mismatch (${name})`);
			continue;
		}
		const template = d.createElement('template');
		template.setAttribute('m:arm', boundaryId);
		template.innerHTML = entry.h;
		for (const element of Array.from(template.content.children)) element.setAttribute(seededAttribute, '');
		d.body.append(template);
		script('markless/arm', 'data-boundary', boundaryId, JSON.stringify([tryArm, entry.a]));
		script('markless/state-patch', 'data-graph-node', graphNodeId, JSON.stringify(entry.s));
		arm(boundaryId, []);
		seeded = true;
		log(`seeded ${boundaryId} from ${name}; the stream, or the browser once it ends, revalidates it`);
	}
	if (!seeded) return;
	// Committed now, while no runtime can mistake the seed for the stream's own arm.
	arm!.flush();
	if (!root || !resumeModuleUrl || !loadModule || root.__asyncResumeRuntimeStarted) return;
	const life = (root.__mL ||= {});
	root.__marklessDelegatedDispatch = true;
	void (root.__mResume ||= loadModule(resumeModuleUrl)).then(
		(module) => root.__mL === life && module.resumeContainerEvent({ root, event: 0 }),
	);
}
