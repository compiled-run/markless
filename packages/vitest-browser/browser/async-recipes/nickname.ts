// The newest save's controller. It lives here, not in the component, because the page never shows it.
let latest: AbortController | undefined;

export async function loadNickname(): Promise<string> {
	const response = await fetch('/api/nickname');
	return response.text();
}

export async function saveNickname(name: string) {
	latest?.abort();
	const controller = new AbortController();
	latest = controller;
	try {
		const response = await fetch('/api/nickname', {
			method: 'POST',
			body: name,
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`Saving failed (${response.status})`);
	} catch (error) {
		if (controller.signal.aborted) return;
		throw error;
	}
}
