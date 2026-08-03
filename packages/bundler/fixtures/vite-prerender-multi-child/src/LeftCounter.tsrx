import { CounterLabel } from './CounterLabel.tsrx';

export function LeftCounter({ value, onIncrement }) @{
	<section data-left-child>
		<CounterLabel side="left" value={value} />
		<button data-left-increment onClick={onIncrement}>left +1</button>
	</section>
}
