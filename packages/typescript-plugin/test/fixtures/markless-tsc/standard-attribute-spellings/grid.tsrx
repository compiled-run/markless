// Each handler reads a field only its own event type carries.
export function Grid({ label }: { readonly label: string }) @{
	<table>
		<tr>
			<td colspan="2" rowspan="1">{label}</td>
		</tr>
		<tr>
			<td colspan={2}>
				<div
					tabindex="0"
					onKeyDown={(event) => event.key}
					onKeydown={(event) => event.code}
					onPointerDown={(event) => event.pointerType}
					onFocusIn={(event) => event.relatedTarget}
					onDblClick={(event) => event.detail}
				>{label}</div>
			</td>
		</tr>
	</table>
}
