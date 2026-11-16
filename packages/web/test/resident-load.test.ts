import { expect, test } from 'vitest';
import { PACK_RESIDENT, marklessWhenLoaded } from '../src/fns/resident-load.ts';

const resident = (load: () => unknown) =>
	Object.assign(Promise.resolve().then(load), { [PACK_RESIDENT]: load });

test('a module already on the page is used in the caller task', () => {
	const mod = { value: 1 };
	expect(marklessWhenLoaded(resident(() => mod), (loaded: typeof mod) => loaded.value)).toBe(1);
});

test('a module still loading is used once it arrives', async () => {
	const using = marklessWhenLoaded(Promise.resolve({ value: 2 }), (loaded: { value: number }) => loaded.value);
	expect(using).toBeInstanceOf(Promise);
	await expect(using).resolves.toBe(2);
});

test('a module that throws as it evaluates, or a use that throws, is a rejected load', async () => {
	const boom = new Error('boom');
	const failing = marklessWhenLoaded(
		resident(() => {
			throw boom;
		}),
		() => 'unreached',
	);
	expect(failing).toBeInstanceOf(Promise);
	await expect(failing).rejects.toBe(boom);

	const refused = marklessWhenLoaded(resident(() => ({})), () => {
		throw boom;
	});
	expect(refused).toBeInstanceOf(Promise);
	await expect(refused).rejects.toBe(boom);
});
