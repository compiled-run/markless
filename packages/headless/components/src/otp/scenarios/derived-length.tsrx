import { state } from '@markless/core';
import { otp } from '../../index.ts';

// Five boxes, and nothing anywhere says five. The count is what the boxes
// themselves register as they render, so a sixth box next sprint is the whole
// change: onComplete would then wait for a sixth character on its own.
export default function DerivedLength() @{
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
			<otp.item index={0} data-testid="item-0" />
			<otp.item index={1} data-testid="item-1" />
			<otp.item index={2} data-testid="item-2" />
			<otp.item index={3} data-testid="item-3" />
			<otp.item index={4} data-testid="item-4" />
		</otp.root>
		<p data-testid="code">{log.code}</p>
		<p data-testid="completions">{log.completions}</p>
	</section>
}
