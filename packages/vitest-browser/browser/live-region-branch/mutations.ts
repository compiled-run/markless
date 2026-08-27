export type RegionWatch = {
	readonly counts: () => { readonly childList: number; readonly characterData: number };
	readonly total: () => number;
	readonly reset: () => void;
	readonly stop: () => void;
};

/**
 * What a screen reader would act on inside one live region: every childList and
 * characterData record, including a rewrite whose value did not change - the
 * reader announces on the record, not on the difference.
 */
export function watchRegion(element: Element): RegionWatch {
	let childList = 0;
	let characterData = 0;
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'childList') childList += 1;
			else if (record.type === 'characterData') characterData += 1;
		}
	});
	observer.observe(element, { childList: true, characterData: true, subtree: true });
	const drain = () => {
		for (const record of observer.takeRecords()) {
			if (record.type === 'childList') childList += 1;
			else if (record.type === 'characterData') characterData += 1;
		}
	};
	return {
		counts: () => {
			drain();
			return { childList, characterData };
		},
		total: () => {
			drain();
			return childList + characterData;
		},
		reset: () => {
			drain();
			childList = 0;
			characterData = 0;
		},
		stop: () => observer.disconnect(),
	};
}

/**
 * Counts read too early cannot tell "none" from "not yet": the runtime is
 * demand-loaded, so the records a gesture causes can land several turns after
 * it. Wait for the watches to stop moving before anything is asserted.
 */
export async function quietWatches(watches: ReadonlyArray<RegionWatch>): Promise<void> {
	const total = () => watches.reduce((sum, watch) => sum + watch.total(), 0);
	let last = total();
	for (let quiet = 0; quiet < 4; ) {
		await new Promise((resolve) => setTimeout(resolve, 60));
		const next = total();
		quiet = next === last ? quiet + 1 : 0;
		last = next;
	}
}
