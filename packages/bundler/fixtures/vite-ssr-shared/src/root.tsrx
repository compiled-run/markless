import { shell } from './shared-shell.tsrx';

export function App() @{
	const pageShell = shell();

	<section data-shared-app>
		<button
			data-shared-action
			onClick={() => {
				pageShell.activeCartId = 'client-cart';
				pageShell.status = 'client-ready';
			}}
		>
			{pageShell.status}
		</button>
		<aside data-shared-panel>{pageShell.activeCartId} / {pageShell.status}</aside>
	</section>
}
