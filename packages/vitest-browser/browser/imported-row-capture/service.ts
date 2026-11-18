// The server answers `slow` long past its first-flush deadline and `late` just past it, so those rows stream in after the shell.
const STREAMED_AFTER_MS = { slow: 60, late: 15 } as Record<string, number>;

// Every other row answers before any timer fires, so it renders inside the first flush however loaded the machine is.
export async function loadNote(id: string): Promise<string> {
	const after = typeof window === 'undefined' ? STREAMED_AFTER_MS[id] : undefined;
	if (after) await new Promise<void>((resolve) => setTimeout(resolve, after));
	else await Promise.resolve();
	return `${id} note`;
}
