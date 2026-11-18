import { state } from '@markless/core';
import { Pair } from './pair.tsrx';

export default function Live() @{
	const page = state({ name: 'one' });
	<main><button type="button" data-rename onClick={() => { page.name = 'two'; }}>rename</button><Pair name={page.name} /></main>
}
