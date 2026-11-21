import Foundation
@testable import MarklessCore
import Testing

// The S21 rung's app style and payload as the harness builds them (proofs/s21-styled-rows, Dragon branch cw/markless-rows).
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func notes() throws -> (StyleExport, NativeViewPayload) {
	let styles = try StyleExport.decodeApp(try fixture("s21-styled-rows.native-app-style"))
	guard case let .app(app) = try NativePayload.decode(try fixture("s21-styled-rows.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	return (try #require(styles["/"]), try #require(app.routes.first { $0.pattern == "/" }).page)
}

@Test func aPageWithStyledRowsStartsAtTheTemplatesOwnRowState() throws {
	let (style, page) = try notes()
	let runtime = NativeRuntime(payload: page)
	let layout = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:))
	#expect(layout.stateCells.contains("h5#class"))
}

@Test func eachRowTakesTheAssignmentItsOwnClassReaches() throws {
	let (style, page) = try notes()
	let runtime = NativeRuntime(payload: page)
	let layout = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:))
	let rows = try #require(try style.shownRows(page, runtime: runtime)(layout.start)["repeat:0"])
	#expect(rows.map(\.key) == ["a", "b"])
	// The template is laid out at the first value the class lists, `note pinned`: row b's.
	#expect(rows[1].assignment == layout.start)
	#expect(rows[0].assignment != layout.start)
	#expect(rows[1].texts["h6:text0"] == "Call the plumber about the kitchen tap before Friday")
}
