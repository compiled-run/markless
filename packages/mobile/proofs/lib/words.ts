const wait = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const id = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(id);
			reject(signal.reason);
		});
	});

export async function lookUp(
	word: string,
	signal: AbortSignal,
): Promise<{ word: string; echo: string }> {
	await wait(4000, signal);
	if (word === 'missing') throw new Error('No entry for missing');
	const response = await fetch(`http://127.0.0.1:47608/j11/word?word=${word}`, { signal });
	if (!response.ok) throw new Error(`The server answered ${response.status}`);
	const [, path = ''] = (await response.text()).split(' ');
	return { word, echo: path.slice(path.indexOf('=') + 1) };
}
