import { state } from '@markless/core';
import { FilterBox } from '../src/filter-box.tsrx';

export default function FilterPage() @{
	let needle = state('');
	<main>
		<FilterBox hint="Filter" onFilter={(value) => (needle = `needle:${value}`)} />
		<output data-needle>{needle}</output>
	</main>;
}
