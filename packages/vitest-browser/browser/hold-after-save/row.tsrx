export function TodoRow({ title }: { title: string }) @{
	<li data-todo>{title}</li>
}

export function SavingRow({ title }: { title: string | null }) @{
	<li data-saving-slot>
		@if (title !== null) {
			<span data-saving>{title}</span>
		}
	</li>
}
