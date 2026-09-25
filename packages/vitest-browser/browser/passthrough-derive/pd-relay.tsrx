import { computed } from '@markless/core';
import Leaf from './pd-leaf.tsrx';
import { summed } from './pd-sum.ts';

function Hop({ seed }) @{
	const base = computed(() => summed(100, seed));
	<section><output data-base>{base}</output><Leaf base={base} seed={seed} /></section>
}

export default function Relay({ seed }) @{
	<Hop seed={seed} />
}
