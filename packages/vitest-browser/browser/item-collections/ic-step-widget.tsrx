import { computed, element, shared, state } from '@markless/core';

// A family whose part is declared before its root, and whose root renders its parts itself: the root is still the
// instance every part reads, so each part's place is its own and the step moves one part at a time.
export const steps = shared(
	() => {
		const s = state({ step: 0 });
		const stepEls = element<HTMLLIElement[]>();
		return {
			...s,
			stepEls,
			next() {
				s.step = s.step + 1;
			},
		};
	},
	{ scope: 'subtree' },
);

export function StepItem({ name }: { readonly name: string }) @{
	const w = steps();
	const mine = element<HTMLLIElement>();
	const pos = computed(() => w.stepEls.indexOf(mine as HTMLLIElement));
	const here = computed(() => {
		const on = w.step;
		return on === pos;
	});

	<li data-ic-item el={[w.stepEls, mine]} ui-pos={pos} hidden={here !== true}>{name}</li>
}

export function StepRoot() @{
	const w = steps();

	<section>
		<button type="button" data-ic-next onClick={() => w.next()}>next</button>
		<ol>
			<StepItem name="alpha" />
			<StepItem name="bravo" />
			<StepItem name="charlie" />
		</ol>
	</section>
}
