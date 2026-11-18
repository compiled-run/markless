type Options = {
	tries: number;
	signal: AbortSignal;
};

export async function retry<T>(
	load: () => Promise<T>,
	{ tries, signal }: Options,
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await load();
		} catch (error) {
			if (signal.aborted || attempt === tries) {
				throw error;
			}
		}
		await wait(1000 * 2 ** (attempt - 1), signal);
	}
}

function wait(ms: number, signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(signal.reason);
		});
	});
}
