import DefaultRootLayout, { Shell } from './default-root-layout.tsrx';

export default function DefaultRootPage() @{
	<main data-page>
		<DefaultRootLayout>
			<p data-body>Body</p>
		</DefaultRootLayout>
		<Shell>
			<p data-loose>Loose</p>
		</Shell>
	</main>
}
