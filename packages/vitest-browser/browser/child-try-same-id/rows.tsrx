import Outer from './outer.tsrx';

export default function Rows() @{
	const shelves = ['left', 'right'];

	<main>
		@for (const shelf of shelves; key shelf) {
			<div data-shelf={shelf}>
				<Outer />
			</div>
		}
	</main>
}
