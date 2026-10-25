export default function HeadCard({ label, href }: { readonly label: string; readonly href: string }) @{
	<div class="card">
		<div>
			@if (label) {
				<span>{label}</span>
			}
		</div>
		<div>
			<a href={href}>link</a>
		</div>
	</div>
}
