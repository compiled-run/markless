import { shared, state } from '@markless/core';

export const pickState = shared(
	() => {
		const pick = state({ value: '' });
		return {
			...pick,
			onPick: undefined as ((value: string) => void) | undefined,
			choose(raw: string) {
				const next = raw + '!';
				pick.value = next;
				pick.onPick?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

function PickRoot({ onPick }: { readonly onPick: (value: string) => void }) @{
	const pick = pickState();
	pick.onPick = onPick;
	<button type="button" data-pick onClick={(next) => pick.choose('a' + next.type)}>{pick.value}</button>
}

export default function ShadowedEventParameterPage() @{
	let seen = state('none');
	<main>
		<PickRoot onPick={(value: string) => (seen = value)} />
		<output>{seen}</output>
	</main>
}
