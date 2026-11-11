// The server answers `slow` past its first-flush deadline, so that row streams in after the shell.
const STREAMED_AFTER_MS = 60;

export async function loadNote(id: string): Promise<string> {
	const wait = typeof window === 'undefined' && id === 'slow' ? STREAMED_AFTER_MS : 5;
	await new Promise<void>((resolve) => setTimeout(resolve, wait));
	return `${id} note`;
}
