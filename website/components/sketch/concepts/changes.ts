// Records which elements a live demo really changed, so a figure reports what the DOM did.
const logs = new WeakMap<Element, MutationRecord[]>();
const observers = new WeakMap<Element, MutationObserver>();

/** Starts recording changes inside `target`; safe to call again. Call it before the reader acts. */
export const watchText = (target: Element | undefined): void => {
	if (!target || observers.has(target)) return;
	const log: MutationRecord[] = [];
	const observer = new MutationObserver((records) => log.push(...records));
	observer.observe(target, { subtree: true, childList: true, characterData: true });
	logs.set(target, log);
	observers.set(target, observer);
};

/** Each element whose text changed since the last call, in page order; clears the record. */
export const takeTextChanges = (target: Element | undefined): Element[] => {
	if (!target) return [];
	const log = logs.get(target);
	const observer = observers.get(target);
	if (!log || !observer) return [];
	log.push(...observer.takeRecords());
	const changed = new Set<Element>();
	for (const record of log.splice(0)) {
		const node = record.target;
		const owner = node instanceof Element ? node : node.parentElement;
		if (owner && owner !== target && target.contains(owner)) changed.add(owner);
	}
	return [...changed]
		.filter((element) => element.isConnected)
		.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
};
