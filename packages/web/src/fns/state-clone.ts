// A shallow-per-cell copy of the served state draft: cells get fresh objects so
// a render can rewrite their values without touching the source payload.
export type MarklessCloneableState = {
	readonly cells?: ReadonlyArray<Readonly<Record<string, unknown>>>;
	readonly computed?: ReadonlyArray<unknown>;
	readonly sharedDefinitions?: ReadonlyArray<unknown>;
	readonly [key: string]: unknown;
};

export function marklessCloneState(state: MarklessCloneableState) {
	return {
		...state,
		cells: (state.cells ?? []).map((cell) => ({ ...cell })),
		computed: [...(state.computed ?? [])],
		...(state.sharedDefinitions ? { sharedDefinitions: [...state.sharedDefinitions] } : {}),
	};
}
