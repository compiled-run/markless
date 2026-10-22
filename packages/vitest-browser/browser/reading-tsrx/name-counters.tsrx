import { NameCounter } from './name-counter.tsrx';

export function NameCounters() @{
	<div>
		<NameCounter name="first" />
		<NameCounter name="second" />
	</div>
}
