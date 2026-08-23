import { Content, Root, Title } from './csr-idref-modal.tsrx';

// Two rendered widgets on one page: each dialog must name its OWN title, so a
// token shared across instances is as wrong as a token that names the part.
export default function CsrIdrefModalPage() @{
	<section data-modal-page>
		<div data-modal="a">
			<Root open={true}>
				<Content>
					<Title>Terms A</Title>
				</Content>
			</Root>
		</div>
		<div data-modal="b">
			<Root open={true}>
				<Content>
					<Title>Terms B</Title>
				</Content>
			</Root>
		</div>
	</section>
}
