import PickSearch from './abr-pick-search.tsrx';

function Drawer() @{
	<aside data-drawer>
		<PickSearch />
	</aside>
}

export default function Shop() @{
	<div data-shop>
		<Drawer />
	</div>
}
