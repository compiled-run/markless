import { retry } from './retry.ts';

type Options = {
	tries: number;
	signal: AbortSignal;
};

export async function retryCounted<T>(
	load: () => Promise<T>,
	{ tries, signal }: Options,
): Promise<T> {
	try {
		return await retry(load, { tries, signal });
	} catch (error) {
		if (signal.aborted) throw error;
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Tried ${tries} times. ${reason}`);
	}
}
