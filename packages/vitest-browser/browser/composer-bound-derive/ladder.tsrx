import { computed } from '@markless/core';
import { shifted } from './shift.ts';

function Rung({ below }) @{
	const top = computed(() => shifted(10, below));
	<output data-rung>{top}</output>
}

export default function Ladder({ seed }) @{
	const first = computed(() => shifted(1, seed));
	<section><output data-ladder>{first}</output><Rung below={first} /></section>
}
