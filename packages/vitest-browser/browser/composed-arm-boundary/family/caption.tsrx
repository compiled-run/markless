import { computed } from '@markless/core';

// A part that renders its own `children` from inside an `@if` arm. The arm has no
// element to bind, so it rebuilds through the branch update symbol, which reads the
// part-local `children` prop rather than the record composition rewrote.
export function Caption({ children }) @{
	const fallback = computed(() => 'no caption');

	<span data-caption>
		@if (children) {
			<>{children}</>
		} @else {
			<>{fallback}</>
		}
	</span>
}

// The same projection with no arm around it: it follows its own record.
export function Note({ children }) @{
	<span data-note>{children}</span>
}
