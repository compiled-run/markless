import type { Segment } from './types.ts';

export default function Segments({ parts }: { readonly parts: readonly Segment[] }) @{
	<span class="segments">
		@for (const part of parts; key part.id) {
			@if (part.code) {
				<code>{part.text}</code>;
			} @else if (part.href) {
				<a href={part.href}>{part.text}</a>;
			} @else {
				<span>{part.text}</span>;
			}
		}
	</span>;
}
