export async function fetchInbox(signal: AbortSignal) {
	const response = await fetch('/inbox.json', { signal });
	return (await response.json()) as { mails: Array<{ id: string; subject: string }> };
}
