import { state, storage } from '@markless/core';
import { Link } from '@markless/router';
import Nav from '../src/nav.tsrx';
import { session } from '../src/session.tsrx';

let theme = storage('fragment-theme', 'light');

export default function Home() @{
	let count = state(0);
	let open = state(false);
	let late = state('idle');
	const visit = session();

	<main data-page="home" class="home">
		<title>Home page</title>
		<style>
			.home .mark { color: rgb(10, 20, 30); }
		</style>
		<Nav />
		<p class="mark" data-mark>home</p>
		<output data-count>{count}</output>
		<button type="button" data-increment onClick={() => count++}>Increment</button>
		<output data-theme>{theme}</output>
		<button type="button" data-theme-toggle onClick={() => (theme = theme === 'light' ? 'dark' : 'light')}>Theme</button>
		<output data-hits>{visit.hits}</output>
		<button type="button" data-hit onClick={() => visit.hits++}>Hit</button>
		<output data-late>{late}</output>
		<button
			type="button"
			data-late-write
			onClick={async () => {
				late = 'waiting';
				await new Promise((resolve) => setTimeout(resolve, 400));
				late = 'written';
				theme = 'late';
				count = 99;
			}}
		>Late write</button>
		<input data-field value="" />
		<button type="button" data-open onClick={() => (open = true)}>Open</button>
		<div data-backdrop overlay hidden={!open}>
			<div role="dialog" aria-modal="true" data-dialog>
				<Link href="/other" data-dialog-link>Leave from dialog</Link>
				<button type="button" data-close onClick={() => (open = false)}>Close</button>
			</div>
		</div>
		<div style="height: 3000px" data-spacer></div>
		<Link href="/other" data-bottom-link>Bottom link</Link>
	</main>
}
