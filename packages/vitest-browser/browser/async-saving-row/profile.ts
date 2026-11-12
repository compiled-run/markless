// Alternate shape: one async record rather than a list, and a failing load for the @catch arm.
export type Profile = { name: string };

const STREAMED_AFTER_MS = 60;
const wait = () =>
	new Promise((resolve) => setTimeout(resolve, typeof window === 'undefined' ? STREAMED_AFTER_MS : 5));

export async function loadProfile(): Promise<Profile> {
	await wait();
	return { name: 'Ada' };
}

export async function loadFailing(): Promise<Profile> {
	await wait();
	throw new Error('Profile down');
}
