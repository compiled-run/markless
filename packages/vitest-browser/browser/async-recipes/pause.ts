export function pause(
	ms: number,
	signal: AbortSignal,
) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(signal.reason);
		});
	});
}
