export type Patch = { readonly id: number; readonly n: number };

export function startFeed(
	onPatch: (patch: Patch) => void,
	patches: ReadonlyArray<Patch>,
): () => void {
	let index = 0;
	const timer = setInterval(() => {
		if (index < patches.length) onPatch(patches[index++]!);
		else clearInterval(timer);
	}, 15);
	return () => clearInterval(timer);
}
