import Foundation
@testable import MarklessCore
import Testing

// The S28 rung's app style and payload as the harness builds them (proofs/s28-rehosted-stacking): a z-index box inside .actions
// inside .card, both with later siblings, which Dragon paints in html's stacking order.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func rehosted(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> StyleLayout {
	var json = try #require(try JSONSerialization.jsonObject(with: try fixture("s28-rehosted-stacking.native-app-style")) as? [String: Any])
	edit(&json)
	let styles = try StyleExport.decodeApp(try JSONSerialization.data(withJSONObject: json))
	guard case let .app(app) = try NativePayload.decode(try fixture("s28-rehosted-stacking.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	let style = try #require(styles["/"])
	let page = try #require(app.routes.first { $0.pattern == "/" }).page
	let runtime = NativeRuntime(payload: page)
	return try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:))
}

/// Adds `write` to the write list of export node `id` (lists are shared, so every node with the same list gets it too).
private func adding(_ write: [String: Any], to id: String) -> (inout [String: Any]) -> Void {
	{ json in
		var targets = json["targets"] as! [String: Any]
		var ios = targets["ios"] as! [String: Any]
		let routes = ios["routes"] as! [[String: Any]]
		let nodes = (routes[0]["assignments"] as! [[String: Any]])[0]["nodes"] as! [[String: Any]]
		let index = nodes.first { $0["id"] as? String == id }!["writes"] as! Int
		var writes = ios["writes"] as! [[Any]]
		writes[index].append(write)
		ios["writes"] = writes
		targets["ios"] = ios
		json["targets"] = targets
	}
}

@Test func aBoxPaintedInTheRootsOrderPastAncestorsWithLaterSiblingsIsPlacedInThePagesTopBox() throws {
	let layout = try rehosted()
	let lifted = try #require(layout.styles["h5"])
	#expect(lifted.stackingParent == "h0")
	#expect(lifted.paintOrder?.bucket == 2)
	// Its frame in h0's box: its own (0, 288) in .actions, .actions at (39, 39) in .card, .card at (48, 290.625) in h0; device px / 3.
	#expect(lifted.frame == Frame(x: 0.0 / 3 + 87.0 / 3, y: 288.0 / 3 + 329.625 / 3, width: 265.453125 / 3, height: 132.0 / 3))
	#expect(layout.styles["h5:text0"]?.stackingParent == nil)
	#expect(layout.styles["h7"]?.stackingParent == nil)
	#expect(layout.styles["h4"]?.stackingParent == nil)
}

@Test func aBoxPaintedPastAnAncestorThatClipsOrScrollsIsRefusedByName() throws {
	#expect(throws: PayloadError(path: "style", reason: "h5: painting in html's stacking order past h4, which clips or scrolls, is not implemented on iOS")) {
		try rehosted(adding(["kind": "padding-box-clip", "key": "dragonClip.frame"], to: "h4"))
	}
}
