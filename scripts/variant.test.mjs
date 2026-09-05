import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/variant.js', import.meta.url), 'utf8');

function load(search, saved, blocked = false) {
	const attributes = {};
	let stored = saved;
	runInNewContext(source, {
		URLSearchParams,
		location: { search },
		document: {
			documentElement: { setAttribute: (key, value) => (attributes[key] = value) },
			addEventListener() {},
		},
		localStorage: {
			getItem() {
				if (blocked) throw Error('Storage unavailable');
				return stored;
			},
			setItem(key, value) {
				if (blocked) throw Error('Storage unavailable');
				stored = value;
			},
		},
	});
	return { variant: attributes['data-variant'], stored };
}

test('a shared link selects and remembers its design', () => {
	assert.deepEqual(load('?variant=b', 'a'), { variant: 'b', stored: 'b' });
});

test('ordinary navigation retains the chosen design', () => {
	assert.equal(load('', 'b').variant, 'b');
});

test('invalid and retired choices fall back to a saved design or Brackets', () => {
	assert.equal(load('?variant=unknown', 'b').variant, 'b');
	assert.equal(load('?variant=c', 'b').variant, 'b');
	assert.equal(load('', 'd').variant, 'a');
});

test('shared links still work when browser storage is blocked', () => {
	assert.equal(load('?variant=b', null, true).variant, 'b');
});
