import { navbar } from '../../index.ts';

// The w3c/aria-at disclosure-navigation fixture, rebuilt on this family: the
// "Mythical University" navigation with three buttons and the sample page
// content region beside it.
//
// It exists so the screen-reader lane can assert the plan's own assertions
// against our markup rather than against an invented page - the navigation
// landmark and its name, the three button names, collapsed and expanded, the
// link names inside a dropdown, the current page, and the named region.
//
// One assertion in the plan has no counterpart here on purpose: `listBoundary`,
// priority 3, which wants the `<ul>`/`<li>` this family does not render. The QDS
// reference dropped the list deliberately and the measured cost is that one
// weakest-tier row; note.md records it rather than letting it pass unnoticed.
export default function University() @{
	<div>
		<navbar.root aria-label="Mythical University" data-testid="root">
			<navbar.item value="about" data-testid="about-item">
				<navbar.itemtrigger data-testid="about-itemtrigger">About</navbar.itemtrigger>
				<navbar.itemcontent data-testid="about-itemcontent">
					<navbar.itemlink href="/about/overview" data-testid="overview-itemlink">Overview</navbar.itemlink>
					<navbar.itemlink href="/about/tours" current data-testid="tours-itemlink">
						Campus Tours
					</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.item value="academics" data-testid="academics-item">
				<navbar.itemtrigger data-testid="academics-itemtrigger">Academics</navbar.itemtrigger>
				<navbar.itemcontent data-testid="academics-itemcontent">
					<navbar.itemlink href="/academics/colleges" data-testid="colleges-itemlink">Colleges</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.item value="admissions" data-testid="admissions-item">
				<navbar.itemtrigger data-testid="admissions-itemtrigger">Admissions</navbar.itemtrigger>
				<navbar.itemcontent data-testid="admissions-itemcontent">
					<navbar.itemlink href="/admissions/apply" data-testid="apply-itemlink">Apply</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
		</navbar.root>
		<div role="region" aria-label="Mythical University sample page content" data-testid="page">
			<p>Sample page content.</p>
		</div>
	</div>
}
