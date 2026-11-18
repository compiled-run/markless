import Board from './board.tsrx';

function Shell() @{
	<section data-shell>
		<Board />
	</section>
}

export default function TwiceComposedBoard() @{
	<div data-page>
		<Shell />
	</div>
}
