import { shared, state } from '@markless/core';

// A widget whose root seeds the same field an arm-held part seeds, so what an
// arm that does not render leaves behind is observable.
const flag = shared(
	() => {
		const f = state({ invalid: false });
		return { ...f };
	},
	{ scope: 'widget' },
);

function Root({ invalid = false, children }) @{
	const f = flag();
	f.invalid = invalid;

	<div data-root>{children}</div>
}

function Trigger() @{
	const f = flag();

	<button type="button" data-trigger aria-invalid={f.invalid ? 'true' : 'false'}>x</button>
}

// `data-invalid` reads the widget instance from inside the arm: a part an arm
// holds has to see the same seeded values its siblings do.
function Err({ children }) @{
	const f = flag();
	f.invalid = true;

	<div data-error data-invalid={f.invalid ? 'yes' : 'no'}>{children}</div>
}

function Widget({ invalid, showError, children }) @{
	<Root invalid={invalid}>
		<Trigger />
		<span data-slot>@if (showError) { <Err>{children}</Err> }</span>
	</Root>
}

export function App() @{
	<section data-testid="arm-seed-baseline">
		<div data-case="root-false-arm-closed">
			<Widget invalid={false} showError={false}>bad</Widget>
		</div>
		<div data-case="root-false-arm-open">
			<Widget invalid={false} showError>bad</Widget>
		</div>
		<div data-case="root-true-arm-closed">
			<Widget invalid showError={false}>bad</Widget>
		</div>
	</section>
}
