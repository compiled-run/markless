export default function InlineScript() @{
	<main>
		<script data-inline>{"window.__inlineProbe = (1 < 2 && 3 > 2) ? 'a&b \"q\"' : 'no';"}</script>
	</main>
}
