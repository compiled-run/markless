export default function SectionField({ section }: { readonly section: string }) @{
	<label class="section-field" data-section-field>
		<span>{'Jump to another section of the documentation by typing its name here and pressing the Enter key. '}</span>
		<span>{'The field starts with the section of the page you are reading, and every page renders the same field. '}</span>
		<input class="section-input" data-shell-field value={section} />
	</label>
}
