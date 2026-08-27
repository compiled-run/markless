import { Control, Description, ErrorText, Root } from './idref-list-field.tsrx';

// Three consumers of one family, differing only in which message parts they
// placed: both, one, and neither.
export default function IdrefListPage() @{
	<section data-list-page>
		<div data-field="both">
			<Root invalid={true}>
				<Control />
				<ErrorText>Too short</ErrorText>
				<Description>At least 8 characters</Description>
			</Root>
		</div>
		<div data-field="one">
			<Root>
				<Control />
				<Description>At least 8 characters</Description>
			</Root>
		</div>
		<div data-field="none">
			<Root>
				<Control />
			</Root>
		</div>
	</section>
}
