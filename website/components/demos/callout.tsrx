import Sprite from '../sprite.tsrx';

// `sticker` names one of the die-cut stickers to sit on the callout's corner.
// It is a data attribute the stylesheet paints rather than an <img>, because an
// element cannot be left out without `@if`, which hangs the build on 0.3.1
// (NOTES.md finding 23), and a hidden <img> would still fetch its src.
export default function Callout({
	title,
	text,
	sprite,
	sticker,
}: {
	readonly title: string;
	readonly text: string;
	readonly sprite?: string;
	readonly sticker?: string;
}) @{
	<aside class="callout" data-sticker={sticker ?? ''}>
		<p class="callout-title">
			<Sprite name={sprite ?? 'speech-bubble'} size="1.5em" />
			{title}
		</p>
		<p class="callout-body">{text}</p>
	</aside>
}
