export const later = <T>(value: T): Promise<T> =>
	new Promise((resolve) => {
		((globalThis as { __heldResults?: Array<() => void> }).__heldResults ??= []).push(() =>
			resolve(value),
		);
	});
