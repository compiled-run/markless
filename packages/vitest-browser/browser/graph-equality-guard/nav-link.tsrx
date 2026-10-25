import { state } from '@markless/core';

export default function NavLink({ to }: { to: string }) @{
	let tab = state('news');
	let follows = state(0);

	<p>
		<a
			href="#nav"
			data-nav
			onClick={(event) => {
				if (to === '/show') event.preventDefault();
				follows = follows + 1;
			}}
		>{follows}</a>
		<a
			href="#tab"
			data-tab
			onClick={(event) => {
				if (tab !== 'news') return;
				event.preventDefault();
				follows = follows + 1;
			}}
		>{tab}</a>
		<button type="button" data-switch onClick={() => (tab = tab === 'news' ? 'show' : 'news')}>switch</button>
	</p>
}
