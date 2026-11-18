import { state } from '@markless/core';
import { Btn } from './btn.tsrx';

function Option({ to }: { readonly to: string }) @{
	const page = state({ last: '' });
	<Btn data-pick={to} onClick={() => { page.last = to; }}>{to + ' -> ' + page.last}</Btn>
}

function Row() @{
	<li>
		<Option to="dark" />
		<Option to="light" />
	</li>
}

function Menu() @{
	<ul>
		<Row />
	</ul>
}

function Search() @{
	<Btn data-plain="">search</Btn>
}

function Tools() @{
	<div>
		<Search />
	</div>
}

function Header() @{
	<header>
		<Tools />
		<Menu />
	</header>
}

export default function Deep() @{
	<main>
		<Header />
	</main>
}
