export const CARD_COUNT = 10;

const WORDS = ['cedar', 'ember', 'flint', 'harbor', 'indigo', 'juniper', 'kelp', 'linen'];

export function delayFor(scenario, index) {
	if (scenario === 'staggered') return (index + 1) * 5;
	if (scenario === 'all-fast') return 1;
	throw new TypeError(`unknown streaming scenario: ${scenario}`);
}

export async function loadCard(scenario, index) {
	await new Promise((resolve) => setTimeout(resolve, delayFor(scenario, index)));
	return {
		title: `Card ${index} — ${WORDS[index % WORDS.length]}`,
		subtitle: `Deterministic async card ${index}`,
		tag: `group-${index % 4}`,
		note: `batch ${(index * 13) % 7}`,
		items: Array.from({ length: 5 }, (_, itemIndex) => ({
			label: `${WORDS[(index + itemIndex) % WORDS.length]} spec ${itemIndex}`,
			value: `value ${(index * 31 + itemIndex * 7) % 97}`,
		})),
	};
}
