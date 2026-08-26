import { shared, state } from '@markless/core';

// A family's widget root is the first component in the module that seeds it, so
// `Outer` roots `outerState`, `Inner` roots `innerState` and `Step` roots
// `stepState`. Rooting one family must leave a component an ordinary PART of
// every other family that encloses it, so its writes land in that instance.
export const outerState = shared(
	() => {
		const outer = state({ label: '', count: 0, mark: 0 });

		return { ...outer };
	},
	{ scope: 'widget' },
);

export const innerState = shared(
	() => {
		const inner = state({ place: 0, hits: 0 });

		return { ...inner };
	},
	{ scope: 'widget' },
);

export const stepState = shared(
	() => {
		const step = state({ name: '', ping: 0 });

		return { ...step };
	},
	{ scope: 'widget' },
);

export function Outer({ label, children }) @{
	const outer = outerState();
	// The root seeds the family, which is what makes it the family's widget root.
	outer.label = label;

	<div data-outer data-label={outer.label} data-count={outer.count} data-mark={outer.mark}>
		<button
			data-outer-bump
			type="button"
			onClick={() => {
				outer.mark = outer.mark + 1;
			}}
		>bump</button>
		{children}
	</div>
}

export function Inner({ index, children }) @{
	const outer = outerState();
	const inner = innerState();
	inner.place = index;
	// Registration by index: the last-rendered part's index plus one is the length.
	outer.count = index + 1;

	<div
		data-inner
		data-index={inner.place}
		data-seen-mark={outer.mark}
		data-hits={inner.hits}
		onClick={() => {
			inner.hits = inner.hits + 1;
		}}
	>{children}</div>
}

// Roots a widget of its own and touches no other family.
export function Step({ name, children }) @{
	const step = stepState();
	step.name = name;

	<div data-step data-name={step.name} data-ping={step.ping}>{children}</div>
}

// A plain part of the outer widget that happens to render inside a `Step`.
export function Note({ index }) @{
	const outer = outerState();
	outer.count = index + 1;

	<span data-note data-index={index} data-seen-mark={outer.mark} />
}

// Another part of the outer widget inside the same nested widget, reading what
// `Note` registered.
export function Label() @{
	const outer = outerState();

	<span data-label-part data-seen-count={outer.count} data-seen-mark={outer.mark} />
}
