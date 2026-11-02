export default function PageNote({ label }: { readonly label: string }) @{
	<p class="page-note" data-page-note>
		<span>{'You are reading the documentation for the current release; older releases keep their own copy of every page, '}</span>
		<span>{'and the search box only looks through the release you are reading. This note repeats on every page of the site. '}</span>
		<strong>{label}</strong>
	</p>
}
