import { resizable } from '../../index.ts';

// Right-to-left text: the first panel is the one on the right, so dragging or
// arrowing toward the right grows it.
export default function Rtl() @{
	<div dir="rtl">
		<resizable.root
			defaultSizes={{ nav: 30, main: 70 }}
			data-testid="root"
			style="inline-size: 400px; block-size: 120px"
		>
			<resizable.item value="nav" data-testid="nav">التنقل</resizable.item>
			<resizable.thumb
				value="nav"
				min={10}
				max={80}
				aria-label="Resize navigation"
				data-testid="thumb"
				style="inline-size: 8px; background: #ccc"
			/>
			<resizable.item value="main" data-testid="main">المحتوى</resizable.item>
		</resizable.root>
	</div>
}
