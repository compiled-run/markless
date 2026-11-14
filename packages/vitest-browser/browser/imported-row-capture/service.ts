// The server answers `slow` past its first-flush deadline, so that row streams in after the shell.
const STREAMED_AFTER_MS = 60;

// Every other row answers before any timer fires, so it renders inside the first flush however loaded the machine is.
export async function loadNote(id: string): Promise<string> {
	if (typeof window === 'undefined' && id === 'slow')
		await new Promise<void>((resolve) => setTimeout(resolve, STREAMED_AFTER_MS));
	else await Promise.resolve();
	return `${id} note`;
}
