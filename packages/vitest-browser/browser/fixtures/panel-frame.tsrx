export function PanelFrame({ heading, children }) @{
	<section class="panel">
		<h2 class="panel-heading">{heading}</h2>
		<div class="panel-body">{children}</div>
	</section>
}
