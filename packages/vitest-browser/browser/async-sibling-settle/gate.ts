// Two loads the test answers by hand in the browser; on the server each load waits until its partner has started too.
type Pending = { readonly key: string; readonly settle: () => void };
const waiting: Pending[] = [];

const serverPartners = new Map<string, (release: Promise<void>) => void>();

// A load that starts only after its partner settled never meets it, so it fails instead of hanging the render.
const ALONE_AFTER_MS = 3_000;
// Past the first-flush deadline, so both blocks stream rather than render inline.
const STREAMED_AFTER_MS = 60;

function serverLoad<T>(key: string, partner: string, value: T): Promise<T> {
	return new Promise((resolve, reject) => {
		const met = serverPartners.get(partner);
		if (met) {
			serverPartners.delete(partner);
			const release = new Promise<void>((done) => setTimeout(done, STREAMED_AFTER_MS));
			met(release);
			void release.then(() => resolve(value));
			return;
		}
		const alone = setTimeout(() => {
			serverPartners.delete(key);
			reject(new Error(`${key} started alone`));
		}, ALONE_AFTER_MS);
		serverPartners.set(key, (release) => {
			clearTimeout(alone);
			void release.then(() => resolve(value));
		});
	});
}

export function load<T>(key: string, partner: string, value: T): Promise<T> {
	if (typeof window === 'undefined') return serverLoad(key, partner, value);
	return new Promise((resolve) => waiting.push({ key, settle: () => resolve(value) }));
}

export function asked(key: string): boolean {
	return waiting.some((entry) => entry.key === key);
}

export function answer(key: string): void {
	const index = waiting.findIndex((entry) => entry.key === key);
	if (index < 0) throw new Error(`no load waiting for ${key}`);
	waiting.splice(index, 1)[0]!.settle();
}

export function forgetLoads(): void {
	waiting.length = 0;
}
