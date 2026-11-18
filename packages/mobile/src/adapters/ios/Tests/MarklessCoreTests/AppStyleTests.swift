import Foundation
@testable import MarklessCore
import Testing

// The S3 rung's app style and payload as the harness builds them (proofs/s3-state-styles, Dragon branch cw/native-app-styles).
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func settings() throws -> (StyleExport, NativeViewPayload) {
	let styles = try StyleExport.decodeApp(try fixture("s3-state-styles.native-app-style"))
	guard case let .app(app) = try NativePayload.decode(try fixture("s3-state-styles.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	let page = try #require(app.routes.first { $0.pattern == "/settings" }).page
	return (try #require(styles["/settings"]), page)
}

@Test func expandsEveryStyledRoute() throws {
	let styles = try StyleExport.decodeApp(try fixture("s3-state-styles.native-app-style"))
	#expect(Set(styles.keys) == ["/", "/settings", "/help"])
	#expect(styles["/"]?.bands == nil)
	#expect(styles["/settings"]?.states.map(\.key) == ["state:on", StyleBands.state])
	#expect(styles["/settings"]?.assignments.count == 4)
}

@Test func theBandFollowsTheAppearance() throws {
	let (style, page) = try settings()
	let runtime = NativeRuntime(payload: page)
	let light = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:))
	let dark = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), dark: true)
	#expect(light.start != dark.start)
	#expect(light.styles["h0"]?.background == RGBA(r: 253, g: 252, b: 249, alpha: 255))
	#expect(dark.styles["h0"]?.background == RGBA(r: 29, g: 27, b: 22, alpha: 255))
	let reached = try light.next(from: light.start, cell: StyleBands.state, value: .number(1))
	#expect(reached == dark.start)
}

@Test func aUiAttributeFollowsItsCell() throws {
	let (style, page) = try settings()
	let runtime = NativeRuntime(payload: page)
	let layout = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:))
	let cell = try #require(page.cells.first { $0.styled }).id
	let on = try layout.next(from: layout.start, cell: cell, value: .bool(true))
	let status = try #require(page.nodes.first { node in
		if case let .element(_, attributes, _) = node.kind, attributes["class"]?.hasPrefix("status ") == true { return true } else { return false }
	}).id
	#expect(layout.assignments[layout.start][status]?.background == RGBA(r: 233, g: 236, b: 239, alpha: 255))
	#expect(layout.assignments[on][status]?.background == RGBA(r: 42, g: 157, b: 143, alpha: 255))
}

@Test func refusesAMediaFeatureItDoesNotRead() throws {
	let bands = StyleBands(atoms: [StyleAtom(feature: "width", comparisons: 1, keyword: "none")], bands: [[false], [true]])
	#expect(throws: PayloadError.self) { try bands.band(dark: false) }
}

// The Z3 and Z5 rungs' app styles and payloads (proofs/z3-sheet-size, proofs/z5-sheet-state-style): a system sheet's content
// laid out as its own document at each resting height.
private func styledSheet(_ rung: String) throws -> (StyleExport, NativeViewPayload) {
	let styles = try StyleExport.decodeApp(try fixture("\(rung).native-app-style"))
	guard case let .app(app) = try NativePayload.decode(try fixture("\(rung).payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	return (try #require(styles["/"]), try #require(app.routes.first).page)
}

@Test func aSheetIsLaidOutAtEachRestingHeight() throws {
	let (style, page) = try styledSheet("z3-sheet-size")
	let sheet = try #require(style.sheets.first)
	#expect(sheet.node == "sheet:component-edge:0")
	#expect(sheet.heights.map(\.snapPoint) == [0.5, 1])
	#expect(sheet.heights.map { [$0.style.viewport.width, $0.style.viewport.height] } == [[402, 435], [402, 778]])
	let runtime = NativeRuntime(payload: page)
	let heights = try style.resolveSheet(sheet.node, for: page, initialTexts: try runtime.texts(), value: runtime.value(of:))
	let footer = try heights.map { try #require($0.layout.styles["h9"]?.frame) }
	#expect(footer[0] != footer[1])
	#expect(footer[0].y + footer[0].height < 435)
	#expect(footer[1].y + footer[1].height > 435)
	let cell = try heights.map { try #require($0.layout.styles["h5"]?.frame).width }
	#expect(cell[0] == cell[1])
	let pageLayout = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:))
	#expect(pageLayout.styles["h3"] == nil)
	#expect(pageLayout.styles["h0"] != nil)
}

@Test func aUiAttributeInsideASheetFollowsItsCell() throws {
	let (style, page) = try styledSheet("z5-sheet-state-style")
	let runtime = NativeRuntime(payload: page)
	let layout = try #require(try style.resolveSheet("sheet:component-edge:0", for: page, initialTexts: try runtime.texts(), value: runtime.value(of:)).first).layout
	let on = try layout.next(from: layout.start, cell: "state:express", value: .bool(true))
	#expect(layout.assignments[layout.start]["h4"]?.background == RGBA(r: 255, g: 255, b: 255, alpha: 255))
	#expect(layout.assignments[on]["h4"]?.background == RGBA(r: 42, g: 157, b: 143, alpha: 255))
}

@Test func aStyledPageRefusesASheetWithoutStyles() throws {
	let (styled, page) = try styledSheet("z5-sheet-state-style")
	var style = styled
	style.sheets = []
	let runtime = NativeRuntime(payload: page)
	#expect(throws: PayloadError.self) { try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:)) }
}
