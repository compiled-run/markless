// A shallow-per-cell copy of the served state draft: cells get fresh objects so
// a render can rewrite their values without touching the source payload.
export type MarklessCloneableState = {
	readonly cells?: ReadonlyArray<Readonly<Record<string, unknown>>>;
	readonly computed?: ReadonlyArray<unknown>;
	readonly sharedDefinitions?: ReadonlyArray<unknown>;
	readonly [key: string]: unknown;
};

// A module's served payload holds every component declared in it. Each render
// seeds only the nodes its own component declares, so two instances of a
// same-module component never share one cell.
// Positions, not ids: two components in one module may each declare a state()
// of the same name, so the module payload holds two cells spelling one id.
export function marklessSelectStateNodes<T extends MarklessCloneableState>(
	state: T,
	cellIndexes: ReadonlyArray<number>,
	computedIndexes: ReadonlyArray<number>,
) {
	const cells = state.cells ?? [];
	const computed = state.computed ?? [];
	return {
		...state,
		cells: cellIndexes.flatMap((index) => (cells[index] ? [cells[index]] : [])),
		computed: computedIndexes.flatMap((index) =>
			computed[index] === undefined ? [] : [computed[index]],
		),
	};
}

export function marklessCloneState(state: MarklessCloneableState) {
	return {
		...state,
		cells: (state.cells ?? []).map((cell) => ({ ...cell })),
		computed: [...(state.computed ?? [])],
		...(state.sharedDefinitions ? { sharedDefinitions: [...state.sharedDefinitions] } : {}),
	};
}
