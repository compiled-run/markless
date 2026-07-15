type M13Value =
	| { kind: 'label'; label: string }
	| { kind: 'count'; count: number };

type M13Item = { id: string; label: string };

export function M13Constructs({
	value,
	items,
	load,
}: {
	value: M13Value;
	items: M13Item[];
	load(): Promise<string>;
}) @{
	<section>
		@if (value.kind === 'label') {
			<span>{value.label.toUpperCase()}</span>
		} @else if (value.kind === 'count') {
			@{
				const advanced = value.count + 1;
				<span>{advanced.toFixed()}</span>
			}
		} @else {
			<span>unreachable</span>
		}

		@switch (value.kind) {
			@case 'label': {
				<span>{value.label.toLowerCase()}</span>
			}
			@case 'count': {
				<span>{value.count.toFixed()}</span>
			}
			@default: {
				<span>unreachable</span>
			}
		}

		@try {
			<span>{load()}</span>
		} @pending {
			<span>pending only</span>
		}

		@try {
			<span>{load()}</span>
		} @catch (error) {
			<span>{error.message}</span>
		}

		@try {
			<span>{load()}</span>
		} @pending {
			<span>pending with catch</span>
		} @catch (caught) {
			@{
				const message = caught.message;
				<span>{message.toUpperCase()}</span>
			}
		}

		@for (const item of items) {
			<span>{item.label}</span>
		} @empty {
			<span>plain empty</span>
		}

		@for (const item of items; index index) {
			<span>{index.toFixed()} {item.label}</span>
		} @empty {
			<span>index empty</span>
		}

		@for (item of items; key item.id) {
			<span>{item.label}</span>
		} @empty {
			<span>key empty</span>
		}

		@for (const item of items; index index; key `${index}:${item.id}`) {
			@{
				const nextIndex = index + 1;
				<span>{nextIndex.toFixed()} {item.label}</span>
			}
		} @empty {
			<span>index and key empty</span>
		}
	</section>
}

export function M13ExpressionPosition({ value }: { value: M13Value }) @{
	const selected = @if (value.kind === 'label') {
		<span>{value.label}</span>
	} @else {
		<span>{value.count}</span>
	};
	<div>{selected}</div>
}
