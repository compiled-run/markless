import { computed } from '@markless/core';

export default function NestedWaterfall() @{
	const waterfall = computed(async () => {
		const levelOne = await Promise.resolve(101);
		const levelTwo = await Promise.resolve(levelOne + 101);
		const levelThree = await Promise.resolve(levelTwo + 101);
		const levelFour = await Promise.resolve(levelThree + 101);
		return { value: levelFour };
	});
	<section data-waterfall-async>
		@try {
			<p data-async-settled>level 4 = {waterfall.value}</p>
		} @pending { <p>waterfall pending</p> } @catch { <p>waterfall failed</p> }
	</section>
}
