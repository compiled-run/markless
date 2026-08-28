import { state } from '@markless/core';
import { otp } from '../../index.ts';

// What a real sign-in does with a finished code: the page counts the completions
// so a second, no-op input cannot fire a second submit.
export default function WithOnComplete() @{
	const log = state({ code: '', completions: 0 });

	<section>
		<otp.root
			data-testid="root"
			onComplete={(code: string) => {
				log.code = code;
				log.completions = log.completions + 1;
			}}
		>
			<otp.field data-testid="field" aria-label="Verification code" />
			<otp.item data-testid="item-0" />
			<otp.item data-testid="item-1" />
			<otp.item data-testid="item-2" />
			<otp.item data-testid="item-3" />
		</otp.root>
		<p data-testid="code">{log.code}</p>
		<p data-testid="completions">{log.completions}</p>
	</section>
}
