import { computed } from '@markless/core';
import { summed } from './pd-sum.ts';

export default function Leaf({ base, seed }) @{
	const total = computed(() => summed(base, seed));
	<output data-total>{total}</output>
}
