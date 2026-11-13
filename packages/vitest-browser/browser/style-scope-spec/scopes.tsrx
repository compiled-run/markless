import { OtherFile } from './other-file.tsrx';

export function Scopes() @{
	<main class="host" data-host>
		<style>
			.host { outline-style: solid; outline-width: 3px; }
			.sib { color: rgb(10, 20, 30); }
			.deep { color: rgb(10, 20, 31); }
			.inner { text-decoration-line: underline; }
			.plain { color: rgb(10, 20, 32); }
			.styled { color: rgb(10, 20, 33); }
			.other { color: rgb(10, 20, 34); }
			.order { --order-mark: importer; }
		</style>
		<p class="sib" data-sib>
			sibling <span class="deep" data-deep>below</span>
		</p>
		<style>
			.second { color: rgb(40, 50, 60); }
		</style>
		<p class="second" data-second>second block</p>
		<section class="nest" data-nest>
			<style>
				.nest { outline-style: solid; outline-width: 5px; }
				.inner { color: rgb(70, 80, 90); }
				.sib { font-weight: 700; }
			</style>
			<p class="inner" data-inner>inner</p>
		</section>
		<Plain />
		<Styled />
		<OtherFile />
	</main>
}

function Plain() @{
	<p class="plain" data-plain>plain</p>
}

function Styled() @{
	<>
		<style>
			.own { background-color: rgb(1, 2, 3); }
		</style>
		<p class="styled own" data-styled>styled</p>
	</>
}
