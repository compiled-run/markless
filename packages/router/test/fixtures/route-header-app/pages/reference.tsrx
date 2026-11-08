import SiteHeader from '../src/site-header.tsrx';
import DocsShell from '../src/docs-shell.tsrx';
import PageNote from '../src/page-note.tsrx';
import SectionField from '../src/section-field.tsrx';

export default function Page() @{
	<>
		<SiteHeader path="/reference" />
		<DocsShell section="reference">
			<main class="site-main" data-main="reference">
				<h1 data-title>{'Reference page'}</h1>
				<p>{'The reference page has its own content, which a navigation replaces.'}</p>
			</main>
		</DocsShell>
		<PageNote label="Reference" />
		<SectionField section="reference" />
	</>
}
