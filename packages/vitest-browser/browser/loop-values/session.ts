export function session(
	event: Event,
	files: readonly { readonly name: string }[],
): Promise<number> {
	const box = (event.target as Element | null)?.closest('.code-block');
	return Promise.resolve(box ? files.length : 0);
}
