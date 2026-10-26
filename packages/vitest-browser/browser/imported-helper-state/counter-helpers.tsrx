import { state } from '@markless/core';

export function counterPair() {
	const n = state(0);
	return n;
}

export function counterFrom(initial: number) {
	const start = state(initial);
	return start;
}
