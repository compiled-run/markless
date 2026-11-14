import Reader from './reader.tsrx';

// Only passes its props on.
export default function Forward({ value, list }: { value: number; list: Array<number> }) @{
	<section>
		<Reader value={value} list={list} />
	</section>
}
