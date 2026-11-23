import Foundation
@testable import MarklessCore
import Testing

// The S42 rung's app style and payload as the harness builds them (proofs/s42-text-interpolations): texts inside inline spans,
// which Dragon parents to the span's block container (a <p>), with frames in that block.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func spans(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> StyleLayout {
	var json = try #require(try JSONSerialization.jsonObject(with: try fixture("s42-text-interpolations.native-app-style")) as? [String: Any])
	edit(&json)
	let styles = try StyleExport.decodeApp(try JSONSerialization.data(withJSONObject: json))
	guard case let .app(app) = try NativePayload.decode(try fixture("s42-text-interpolations.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
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
