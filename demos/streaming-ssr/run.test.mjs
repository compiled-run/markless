import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyStreamingRender } from './run.mjs';

test('accepts a staggered stream with pending skeletons and a late slowest card', () => {
	const shell = shellChunk({ settledCards: [0], skeletonCards: cardIndexes().slice(1) });
	const later = cardIndexes()
		.slice(1)
		.map((index) => cardChunk(index));
	const render = renderRecord([shell, ...later], 50);

	const checks = verifyStreamingRender('staggered', render);

	assert.ok(checks.some((check) => check.includes('slowest card arrived after the shell')));
});

test('accepts an all-fast stream that completes in its shell flush', () => {
	const render = renderRecord([shellChunk({ settledCards: cardIndexes(), skeletonCards: [] })], 11);

	assert.doesNotThrow(() => verifyStreamingRender('all-fast', render));
});

test('rejects a buffered staggered adapter that puts the slowest card in the shell', () => {
	const buffered = renderRecord(
		[shellChunk({ settledCards: cardIndexes(), skeletonCards: cardIndexes() })],
		50,
	);

	assert.throws(
		() => verifyStreamingRender('staggered', buffered),
		/slowest card must arrive in a chunk after the shell/,
	);
});

test('rejects a staggered schedule that completes before 40 ms', () => {
	const shell = shellChunk({ settledCards: [], skeletonCards: cardIndexes() });
	const render = renderRecord([shell, ...cardIndexes().map((index) => cardChunk(index))], 39.9);

	assert.throws(
		() => verifyStreamingRender('staggered', render),
		/staggered stream completed in 39\.9 ms; expected at least 40 ms/,
	);
});

test("rejects a shell missing a pending card's skeleton", () => {
	const shell = shellChunk({ settledCards: [], skeletonCards: cardIndexes().slice(1) });
	const render = renderRecord([shell, ...cardIndexes().map((index) => cardChunk(index))], 50);

	assert.throws(
		() => verifyStreamingRender('staggered', render),
		/pending card 0 has no skeleton in the shell/,
	);
});

function renderRecord(chunkValues, totalMs) {
	return {
		chunks: chunkValues.map((value, index) => ({ value, arrivalMs: index + 1 })),
		html: chunkValues.join(''),
		totalMs,
	};
}

function shellChunk({ settledCards, skeletonCards }) {
	return [
		'<main data-stream-shell>',
		...settledCards.map((index) => cardChunk(index)),
		...skeletonCards.map((index) => `<div data-card-skeleton="${index}">Loading</div>`),
		'</main>',
	].join('');
}

function cardChunk(index) {
	return `<article data-stream-card="${index}">Card ${index}</article>`;
}

function cardIndexes() {
	return Array.from({ length: 10 }, (_, index) => index);
}
