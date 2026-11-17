/** What one use runs, as a runtime demand map's first-use reach spells it; `'unknown'` when the map cannot bound it. */
export type FirstUse = {
	readonly symbolIds: ReadonlyArray<string>;
	readonly runtimeModuleIds: ReadonlyArray<string>;
	readonly foreign?: ReadonlyArray<{
		readonly file: string;
		readonly symbolIds: ReadonlyArray<string>;
	}>;
	readonly pageSpaceWrites?: ReadonlyArray<string>;
	readonly calls?: ReadonlyArray<
		{ readonly file?: string; readonly prop: string } | { readonly slot: string }
	>;
};
export type FirstUseReach = FirstUse | 'unknown';

/** A prop a module passes that a child may call, as its demand map's `firstUsePage.passedProps` spells it. */
export type PassedProp = {
	readonly file?: string | null;
	readonly prop?: string;
	readonly excludeNames?: ReadonlyArray<string>;
	readonly reach: FirstUseReach | 'same-prop';
};

/** A first use owned by the compiled file whose demand map names it. */
export type OwnedReach = { readonly file: string; readonly reach: FirstUse };

/** Every page module's `firstUsePage` facts, by what joins them. */
export type FirstUsePageIndex = {
	readonly resumeUnknown: boolean;
	readonly readers: ReadonlyMap<
		string,
		ReadonlyArray<{ readonly file: string; readonly reach: FirstUseReach }>
	>;
	readonly passed: ReadonlyArray<{ readonly file: string; readonly prop: PassedProp }>;
	readonly slots: ReadonlyMap<
		string,
		ReadonlyArray<{ readonly file: string; readonly prop: string }>
	>;
};

/**
 * Closes a first use over the page: what every module re-runs for the page-space cells it writes, and what the
 * modules that compose it pass for the values it calls. The build's pack planner and the dev server both join here.
 */
export function joinFirstUse(
	start: ReadonlyArray<OwnedReach>,
	page: FirstUsePageIndex,
):
	| { readonly symbols: Map<string, Set<string>>; readonly runtimeModuleIds: Set<string> }
	| 'unknown' {
	if (page.resumeUnknown) return 'unknown';
	const symbols = new Map<string, Set<string>>();
	const runtimeModuleIds = new Set<string>();
	const joinedCells = new Set<string>();
	const joinedProps = new Set<string>();
	const pending = [...start];
	while (pending.length) {
		const { file, reach } = pending.pop()!;
		for (const id of reach.symbolIds) addTo(symbols, file, id);
		for (const foreign of reach.foreign ?? [])
			for (const id of foreign.symbolIds) addTo(symbols, foreign.file, id);
		for (const id of reach.runtimeModuleIds) runtimeModuleIds.add(id);
		for (const graphNodeId of reach.pageSpaceWrites ?? []) {
			if (joinedCells.has(graphNodeId)) continue;
			joinedCells.add(graphNodeId);
			for (const reader of page.readers.get(graphNodeId) ?? []) {
				if (reader.reach === 'unknown') return 'unknown';
				pending.push({ file: reader.file, reach: reader.reach });
			}
		}
		const props = (reach.calls ?? []).flatMap((call) =>
			'slot' in call
				? (page.slots.get(call.slot) ?? [])
				: [{ file: call.file ?? file, prop: call.prop }],
		);
		for (const called of props) {
			const key = `${called.file}\0${called.prop}`;
			if (joinedProps.has(key)) continue;
			joinedProps.add(key);
			for (const { file: publisher, prop: passed } of page.passed) {
				const receiver = passed.file === null ? null : (passed.file ?? publisher);
				if (receiver !== null && receiver !== called.file) continue;
				if (
					passed.prop !== undefined
						? passed.prop !== called.prop
						: (passed.excludeNames ?? []).includes(called.prop)
				)
					continue;
				if (passed.reach === 'unknown') return 'unknown';
				pending.push({
					file: publisher,
					reach:
						passed.reach === 'same-prop'
							? {
									symbolIds: [],
									runtimeModuleIds: [],
									calls: [{ prop: called.prop }],
								}
							: passed.reach,
				});
			}
		}
	}
	return { symbols, runtimeModuleIds };
}

function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
	const values = map.get(key);
	if (values) values.add(value);
	else map.set(key, new Set([value]));
}
