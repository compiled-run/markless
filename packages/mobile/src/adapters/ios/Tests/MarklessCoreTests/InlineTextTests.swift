import Foundation
@testable import MarklessCore
import Testing

// The S45 rung's app style and payload as the harness builds them (proofs/s45-text-interpolations): texts inside inline spans,
// which Dragon parents to the span's block container (a <p>), with frames in that block.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func spans(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> StyleLayout {
	var json = try #require(try JSONSerialization.jsonObject(with: try fixture("s45-text-interpolations.native-app-style")) as? [String: Any])
	edit(&json)
	let styles = try StyleExport.decodeApp(try JSONSerialization.data(withJSONObject: json))
	guard case let .app(app) = try NativePayload.decode(try fixture("s45-text-interpolations.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	let style = try #require(styles["/"])
	let page = try #require(app.routes.first { $0.pattern == "/" }).page
	let runtime = NativeRuntime(payload: page)
	return try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:))
}

private func editingRoute(_ edit: @escaping (inout [String: Any], inout [[Any]]) -> Void) -> (inout [String: Any]) -> Void {
	{ json in
		var targets = json["targets"] as! [String: Any]
		var ios = targets["ios"] as! [String: Any]
		var routes = ios["routes"] as! [[String: Any]]
		var writes = ios["writes"] as! [[Any]]
		edit(&routes[0], &writes)
		ios["routes"] = routes
		ios["writes"] = writes
		targets["ios"] = ios
		json["targets"] = targets
	}
}

@Test func aTextInAnInlineSpanIsLaidOutInTheSpansViewWhereDragonPutsItInTheBlock() throws {
	let styles = try spans().styles
	// The span and its text share one box in the <p>: (51, 39) device px; the text sits at the span's origin.
	#expect(styles["h3"]?.frame == Frame(x: 51.0 / 3, y: 39.0 / 3, width: 928.59375 / 3, height: 60.0 / 3))
	#expect(styles["h3:text0"]?.frame == Frame(x: 0, y: 0, width: 928.59375 / 3, height: 60.0 / 3))
	#expect(styles["h5:text0"]?.frame?.x == 0)
	// A span between two texts: the texts beside it stay in the <p>.
	#expect(styles["h7:text0"]?.frame?.x == 0)
	#expect(styles["h6:text0"]?.frame?.x == 51.0 / 3)
	#expect(styles["h6:text1"]?.frame?.x == 579.15625 / 3)
	// A span that wraps: its text keeps every line, from the span's box.
	#expect(styles["h9:text0"]?.frame == Frame(x: 0, y: 0, width: 885.5625 / 3, height: 180.0 / 3))
	#expect(styles["h9:text0"]?.lines?.count == 3)
}

@Test func aTextOutsideItsParentWithNoInlineBoxBetweenIsRefusedAsBefore() throws {
	#expect(throws: PayloadError(path: "style", reason: "h3:text0's parent is h3 in the payload, h2 in the style export")) {
		try spans(editingRoute { route, _ in route["plan"] = nil; route["planNames"] = nil; route["planRepeats"] = nil })
	}
}

@Test func anInlineSpanThatPaintsABackgroundIsRefusedByName() throws {
	let paint: [String: Any] = ["kind": "background-color", "color": ["r": 255, "g": 0, "b": 0, "alpha": 255], "key": "backgroundColor"]
	#expect(throws: PayloadError(path: "style", reason: "h3:text0: its inline box h3 paints a background, which iOS does not draw on a box Dragon lays out flat in h2")) {
		try spans(editingRoute { route, writes in
			let nodes = (route["assignments"] as! [[String: Any]])[0]["nodes"] as! [[String: Any]]
			let index = nodes.first { $0["id"] as? String == "h3" }!["writes"] as! Int
			writes[index].append(paint)
		})
	}
}

// The S47 rung's: a keyed @for whose row is <li><p>text <span>text</span> text</p></li>, with each row's copy of the template
// ("<id>@<key>") as the live rows layout adds them; `paint` gives the copy of the span its own background.
private func rowSpans(paint: Bool = false) throws -> StyleLayout {
	var json = try #require(try JSONSerialization.jsonObject(with: try fixture("s47-row-inline-text.native-app-style")) as? [String: Any])
	editingRoute { route, writes in
		var assignments = route["assignments"] as! [[String: Any]]
		var nodes = assignments[0]["nodes"] as! [[String: Any]]
		let row = ["h3", "h4", "h4:text0", "h5", "h5:text0", "h4:text1"]
		for id in row {
			var copy = nodes.first { $0["id"] as? String == id }!
			copy["id"] = "\(id)@a"
			if let parent = copy["parent"] as? String, row.contains(parent) { copy["parent"] = "\(parent)@a" }
			if paint, id == "h5" {
				writes.append(writes[copy["writes"] as! Int] + [["kind": "background-color", "color": ["r": 255, "g": 0, "b": 0, "alpha": 255], "key": "backgroundColor"]])
				copy["writes"] = writes.count - 1
			}
			nodes.append(copy)
		}
		assignments[0]["nodes"] = nodes
		route["assignments"] = assignments
	}(&json)
	let styles = try StyleExport.decodeApp(try JSONSerialization.data(withJSONObject: json))
	guard case let .app(app) = try NativePayload.decode(try fixture("s47-row-inline-text.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	let style = try #require(styles["/"])
	let page = try #require(app.routes.first { $0.pattern == "/" }).page
	let runtime = NativeRuntime(payload: page)
	return try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:))
}

@Test func aRowsTextInAnInlineSpanIsLaidOutInTheSpansCopyWhereDragonPutsItInTheRowsBlock() throws {
	let styles = try rowSpans().styles
	#expect(styles["h5@a"]?.frame == Frame(x: 331.125 / 3, y: 39.0 / 3, width: 208.171875 / 3, height: 60.0 / 3))
	#expect(styles["h5:text0@a"]?.frame == Frame(x: 0, y: 0, width: 208.171875 / 3, height: 60.0 / 3))
	// The texts beside the span stay in the row's <p>.
	#expect(styles["h4:text0@a"]?.frame?.x == 51.0 / 3)
	#expect(styles["h4:text1@a"]?.frame?.x == 539.296875 / 3)
}

@Test func aRowsInlineSpanThatPaintsABackgroundIsRefusedByName() throws {
	#expect(throws: PayloadError(path: "style", reason: "h5:text0@a: its inline box h5@a paints a background, which iOS does not draw on a box Dragon lays out flat in h4@a")) {
		try rowSpans(paint: true)
	}
}
