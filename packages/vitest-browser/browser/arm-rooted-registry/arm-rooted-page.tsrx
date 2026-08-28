import { ArmedDialRoot, DialMember, DialRoot, DialToggle } from './dial-family.tsrx';

// Two instances of one family on one page, and the FIRST is rooted by a
// component the compiler designated no root: it carries the family's cells like
// every other resolver, and it holds the `@if` arm whose flip is the only thing
// that moves the roster.
export default function ArmRootedPage() @{
	<section data-page>
		<div data-first>
			<ArmedDialRoot>
				<DialToggle />
				<DialMember>alpha</DialMember>
				<DialMember>bravo</DialMember>
				<DialMember>omega</DialMember>
			</ArmedDialRoot>
		</div>
		<div data-second>
			<DialRoot>
				<DialMember>delta</DialMember>
				<DialMember>echo</DialMember>
			</DialRoot>
		</div>
	</section>
}
