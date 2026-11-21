import { computed, element, shared, state } from '@markless/core';

const stepsState = shared(
	() => {
		const steps = state({ current: 1 });
		const itemEls = element<HTMLDivElement[]>();
		return { ...steps, itemEls };
	},
	{ scope: 'subtree' },
);

function Steps({ children }: { readonly children?: unknown }) @{
	const steps = stepsState();
	<section>
		{children}
		<p>Current step {steps.current + 1}</p>
		<button onClick={() => (steps.current = steps.current === 2 ? 0 : steps.current + 1)}>Next step</button>
	</section>
}

function Step({ title }: { readonly title: string }) @{
	const steps = stepsState();
	const mine = element<HTMLDivElement>();
	// Which step this is, is where it stands among the steps.
	const at = computed(() => steps.itemEls.indexOf(mine as HTMLDivElement));
	<div el={[steps.itemEls, mine]}>Step {at + 1}: {title}</div>
}

export default function App() @{
	<main>
		<h1>Steps</h1>
		<Steps>
			<Step title="Pack" />
			<Step title="Ship" />
			<Step title="Track" />
		</Steps>
	</main>
}
