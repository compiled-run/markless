export type Field = { readonly name: string; readonly items: readonly string[] };

export function JsonView({ fields }: { readonly fields: readonly Field[] }) @{
	<ul data-json>
		@for (const field of fields; key field.name) {
			<li data-field={field.name}>
				<span>{field.name}</span>
				<ol>
					@for (const item of field.items; key item) {
						<li data-item>{item}</li>;
					}
				</ol>
			</li>;
		}
	</ul>;
}
