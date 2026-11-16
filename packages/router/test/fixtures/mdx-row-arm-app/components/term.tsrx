import { popover } from '@markless/ui';

export default function Term({ word }: { readonly word: string }) @{
	<popover.root>
		<Tip word={word} />
	</popover.root>
}

function Tip({ word }: { readonly word: string }) @{
	const tip = popover.state();

	<>
		<popover.trigger data-term={word} onPointerover={() => (tip.open = true)}>{word}</popover.trigger>
		<popover.content data-tip={word} aria-label={`About ${word}`}>What it means</popover.content>
	</>
}
