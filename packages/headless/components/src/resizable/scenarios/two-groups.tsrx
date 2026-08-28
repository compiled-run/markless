import { resizable } from '../../index.ts';

// Two widgets on one page, each with its own instance: a gesture in one leaves
// the other alone.
export default function TwoGroups() @{
	<main>
		<resizable.root
			defaultSizes={{ 'left-nav': 30, 'left-main': 70 }}
			data-testid="first-root"
			style="inline-size: 400px; block-size: 120px"
		>
			<resizable.item value="left-nav" data-testid="first-nav">Navigation</resizable.item>
			<resizable.thumb
				value="left-nav"
				min={10}
				max={80}
				aria-label="Resize the first navigation"
				data-testid="first-thumb"
				style="inline-size: 8px; background: #ccc"
			/>
			<resizable.item value="left-main" data-testid="first-main">Content</resizable.item>
		</resizable.root>
		<resizable.root
			defaultSizes={{ 'right-nav': 50, 'right-main': 50 }}
			data-testid="second-root"
			style="inline-size: 400px; block-size: 120px"
		>
			<resizable.item value="right-nav" data-testid="second-nav">Navigation</resizable.item>
			<resizable.thumb
				value="right-nav"
				min={10}
				max={80}
				aria-label="Resize the second navigation"
				data-testid="second-thumb"
				style="inline-size: 8px; background: #ccc"
			/>
			<resizable.item value="right-main" data-testid="second-main">Content</resizable.item>
		</resizable.root>
	</main>
}
