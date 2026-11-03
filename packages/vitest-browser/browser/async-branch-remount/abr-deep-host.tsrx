import SearchDialog from './abr-search.tsrx';

function Panel() @{
	<section data-panel>
		<SearchDialog />
	</section>
}

export default function Workspace() @{
	<div data-workspace>
		<h1>Workspace</h1>
		<Panel />
	</div>
}
