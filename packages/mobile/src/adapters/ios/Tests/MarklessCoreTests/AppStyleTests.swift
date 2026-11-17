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
