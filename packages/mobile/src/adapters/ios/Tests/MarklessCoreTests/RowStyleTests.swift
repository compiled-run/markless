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

// The S23 rung's: each size's aria-pressed is a comparison with the picked size, so its row state lists "true" and "false".
@Test func aRowsPressedStateFollowsAComparison() throws {
	let styles = try StyleExport.decodeApp(try fixture("s23-styled-row-pressed.native-app-style"))
	guard case let .app(app) = try NativePayload.decode(try fixture("s23-styled-row-pressed.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	let style = try #require(styles["/"])
	let page = try #require(app.routes.first { $0.pattern == "/" }).page
	let runtime = NativeRuntime(payload: page)
	let layout = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:))
	let rows = try #require(try style.shownRows(page, runtime: runtime)(layout.start)["repeat:0"])
	#expect(rows.map(\.key) == ["Small", "Medium", "Large"])
	// The template is laid out pressed, the first value the comparison gives: the picked Medium's row.
	#expect(rows.map { $0.assignment == layout.start } == [false, true, false])
}

// A row's text its item empties has no box, as on the web: Dragon's layout gives it none, and the row's other boxes keep theirs.
@Test func aRowsEmptiedTextHasNoBox() throws {
	let frame = #"{"x":0,"y":0,"width":10,"height":10}"#
	let export = #"{"schema":"dragon.native-style-export/1","units":"device px; frames relative to the parent box","fonts":[],"targets":{"ios":{"backend":"uikit","viewport":{"width":100,"height":100},"dpr":2,"states":[],"initial":0,"next":[[]],"assignments":[{"values":{},"nodes":["# +
		#"{"id":"h0","parent":null,"kind":"element","native":"DragonBoxView","text":null,"frame":\#(frame),"borderWidths":null,"writes":[]},{"id":"h1","parent":"h0","kind":"element","native":"DragonBoxView","text":null,"frame":\#(frame),"borderWidths":null,"writes":[]},{"id":"h1:text0","parent":"h1","kind":"text","native":"DragonTextView","text":"x","frame":\#(frame),"borderWidths":null,"writes":[]}]}],"# +
		#""plan":{"version":"dragon.markless-plan/1"},"planRepeats":[{"id":"repeat:0","parent":"h0","template":["h1"]}]}}}"#
	let style = try StyleExport.decode(Data(export.utf8))
	let hex = { (v: Double) -> String in
		let digits = String(v.bitPattern, radix: 16)
		return "\"" + String(repeating: "0", count: 16 - digits.count) + digits + "\""
	}
	let box = "[\(hex(0)),\(hex(0)),\(hex(10)),\(hex(10))]"
	let answer = "[\"ok\",[\(hex(0)),\(hex(0)),\(hex(0)),\(hex(0))],[[\"h0\",\(box),null,null,null,null],[\"h1@a\",\(box),null,null,null,null],[\"h1@b\",\(box),null,null,null,null],[\"h1:text0@b\",\(box),null,null,null,null]]]"
	let rows: (Int) throws -> [String: [LaidOutRow]] = { _ in
		["repeat:0": [LaidOutRow(key: "a", assignment: 0, texts: ["h1:text0": ""]), LaidOutRow(key: "b", assignment: 0, texts: ["h1:text0": "Milk"])]]
	}
	let laid = try style.laidOut(width: 100, height: 100, scale: 2, layout: { _ in answer }, rows: rows, rowsLayout: { _ in answer })
	let nodes = laid.assignments[0].nodes
	#expect(nodes.first { $0.id == "h1:text0@a" }?.frame == nil)
	#expect(nodes.first { $0.id == "h1@a" }?.frame != nil)
	#expect(nodes.first { $0.id == "h1:text0@b" }?.frame != nil)
	#expect(nodes.first { $0.id == "h1:text0@b" }?.text == "Milk")
}
