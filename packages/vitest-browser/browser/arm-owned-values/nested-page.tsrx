import { state } from '@markless/core';
import Panel from './panel.tsrx';

export default function NestedPage({ start = false }: { start?: boolean }) @{
	let outer = state(true);
	let inner = state(start);
	let id = state(1);

	<div>
		<button type="button" data-inner-open onClick={() => (inner = true)}>Inner</button>
		<button type="button" data-inner-close onClick={() => (inner = false)}>Hide inner</button>
		<button type="button" data-outer-close onClick={() => (outer = false)}>Hide outer</button>
		<button type="button" data-next onClick={() => id++}>Next</button>
		@if (outer) {
			<div>
				<Panel tag="outer" id={id} />
				@if (inner) {
					<Panel tag="inner" id={id} />
				}
			</div>
		}
	</div>
}
