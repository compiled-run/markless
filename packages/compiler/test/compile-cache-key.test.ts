import { expect, test } from 'vitest';
import { compileCacheKey } from '../src/compile-cache.ts';

const interfaceOf = (component: string) => ({
	render: { components: [{ name: component, props: ['label'] }] },
});

const inputWith = (interfaces: Record<string, unknown>) => ({
	filename: '/app/Page.tsrx',
	moduleId: 'Page.tsrx',
	source: '',
	symbols: [],
	importedModuleInterfaces: interfaces as never,
});

test('equal inputs give one key, whichever objects carry them and in whatever order they were linked', () => {
	const button = interfaceOf('Button');
	const first = compileCacheKey(inputWith({ './button.tsrx': button, './card.tsrx': interfaceOf('Card') }));
	const second = compileCacheKey(
		inputWith({ './card.tsrx': interfaceOf('Card'), './button.tsrx': interfaceOf('Button') }),
	);
	expect(first).not.toBeNull();
	expect(second).toBe(first);
	expect(compileCacheKey(inputWith({ './button.tsrx': button, './card.tsrx': interfaceOf('Card') }))).toBe(
		first,
	);
});

test('a child interface that differs gives a different key', () => {
	const key = (component: string) =>
		compileCacheKey(inputWith({ './button.tsrx': interfaceOf(component) }));
	expect(key('Button')).not.toBe(key('Toggle'));
	expect(compileCacheKey(inputWith({}))).not.toBe(compileCacheKey({ ...inputWith({}), importedModuleInterfaces: undefined }));
	expect(compileCacheKey(inputWith({ './a.tsrx': undefined }))).not.toBe(compileCacheKey(inputWith({})));
});
