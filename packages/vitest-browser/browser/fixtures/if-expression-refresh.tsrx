import { computed, shared, state } from '@markless/core';

// Every @if below is gated on a recombined condition - a comparison, a negation,
// a method call on a read, a comparison between two fields of a shared instance.
// Before the branch-condition position minted its synthetic computed, each of
// these arms rendered once and then froze while the plain-read and computed-gated
// arms beside them flipped on the same write.

// The radio-group shape: the condition compares the instance's selected value
// against the row's own value, and nothing in the part's markup names either one.
export const row = shared(() => {
	const cell = state({ value: 'a', own: 'b' });

	return {
		...cell,
		pick() {
			cell.value = cell.value === 'b' ? 'a' : 'b';
		},
	};
}, { scope: 'widget' });

export default function IfExpressionRefreshPage() @{
	let value = state('a');
	let open = state(false);
	let label = state('dark');
	let hidden = state(true);
	let mode = state('on');
	const isB = computed(() => value === 'b');

	<div data-page>
		<button
			type="button"
			data-toggle
			onClick={() => {
				value = value === 'b' ? 'a' : 'b';
				open = !open;
				label = label === 'dark' ? 'lit-up' : 'dark';
				hidden = !hidden;
				mode = mode === 'on' ? 'off' : 'on';
			}}
		>flip</button>

		@if (open) {
			<p data-bare>bare</p>
		}

		@if (isB) {
			<p data-computed>computed</p>
		}

		@if (value === 'b') {
			<p data-comparison>comparison</p>
		}

		@if (!hidden) {
			<p data-negation>negation</p>
		}

		@if (label.includes('lit')) {
			<p data-method>method</p>
		}

		@if (value !== 'b') {
			<p data-initially-true>initially true</p>
		}

		@if (hidden) {
			<p data-bare-initially-true>bare initially true</p>
		}

		@if (mode === 'on') {
			<p data-solo-initially-true>solo initially true</p>
		}

		<Row />
	</div>
}

export function Row() @{
	const r = row();

	<span data-row>
		<button type="button" data-row-toggle onClick={() => r.pick()}>pick</button>
		@if (r.value === r.own) {
			<b data-cross>cross</b>
		}
	</span>
}
