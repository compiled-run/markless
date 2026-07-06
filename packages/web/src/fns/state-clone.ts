export function marklessCloneState(state) {
	return {
		...state,
		cells: (state.cells ?? []).map((cell) => ({ ...cell })),
		computed: [...(state.computed ?? [])],
		...(state.sharedDefinitions ? { sharedDefinitions: [...state.sharedDefinitions] } : {}),
	};
}
