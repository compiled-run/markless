import Foundation
@testable import MarklessCore
import Testing

// The u134 rung's payload and Dragon's export of it (proofs/u134-outline): a rounded solid ring with an offset, a double, a dashed
// and a groove ring, and an outline on the middle of three cells in a row.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func outlines(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> StyleLayout {
	let payload = try NativeViewPayload.decode(try JSONValue.parse(try fixture("u134-outline.payload")))
	let runtime = NativeRuntime(payload: payload)
	var json = try #require(try JSONSerialization.jsonObject(with: try fixture("u134-outline.native-style")) as? [String: Any])
	edit(&json)
	return try StyleExport.decode(try JSONSerialization.data(withJSONObject: json))
		.resolve(for: payload, initialTexts: try runtime.texts(), value: runtime.value(of:))
}

/// Changes export node `id` in every iOS assignment.
private func editing(_ id: String, _ change: @escaping (inout [String: Any]) -> Void) -> (inout [String: Any]) -> Void {
	{ json in
		var targets = json["targets"] as! [String: Any]
		var ios = targets["ios"] as! [String: Any]
		ios["assignments"] = (ios["assignments"] as! [[String: Any]]).map { assignment in
			var a = assignment
			a["nodes"] = (a["nodes"] as! [[String: Any]]).map { node in
				var n = node
				if n["id"] as? String == id { change(&n) }
				return n
			}
			return a
		}
		targets["ios"] = ios
		json["targets"] = targets
	}
}

private func adding(_ write: [String: Any], to id: String) -> (inout [String: Any]) -> Void {
	editing(id) { node in node["writes"] = (node["writes"] as! [Any]) + [write] }
}

private func outlineWrite(of id: String, _ change: @escaping (inout [String: Any]) -> Void) -> (inout [String: Any]) -> Void {
	editing(id) { node in
		node["writes"] = (node["writes"] as! [[String: Any]]).map { write in
			var w = write
			if w["kind"] as? String == "outline" { change(&w) }
			return w
		}
	}
}

private func refusal(_ edit: @escaping (inout [String: Any]) -> Void) -> String {
	do {
		_ = try outlines(edit)
		return "resolved"
	} catch let error as PayloadError {
		return error.reason
	} catch {
		return "\(error)"
	}
}

@Test func aRoundedOutlineCarriesItsBoxAndIsDrawnInThePagesTopView() throws {
	let ring = try #require(try outlines().styles["h2"]?.outline)
	#expect(ring.style == "solid" && ring.width == 3 && ring.offset == 4)
	#expect(ring.color == RGBA(r: 230, g: 57, b: 70, alpha: 255))
	#expect(ring.dpr == 3)
	// The page device px border box, snapped from the frame at y 254.625.
	#expect(ring.edges == [72, 255, 1134, 402])
	#expect(ring.size == [1062, 147])
	#expect(ring.borders == [6, 6, 6, 6])
	#expect(ring.radii == Array(repeating: OutlinePaint.RadiusLength(percent: false, value: 14), count: 8))
	// html paints it; main is the page's top view, where html's later boxes are placed too.
	#expect(ring.host == "h0")
	#expect(ring.hostX == 0 && ring.hostY == 0)
}

@Test func doubleDashedAndGrooveOutlinesKeepTheirStylesAndTones() throws {
	let layout = try outlines()
	let double = try #require(layout.styles["h3"]?.outline)
	#expect(double.style == "double" && double.width == 7)
	#expect(double.radii.allSatisfy { $0.value == 0 })
	#expect(double.tones == Array(repeating: RGBA(r: 42, g: 157, b: 143, alpha: 255), count: 3))
	let dashed = try #require(layout.styles["h4"]?.outline)
	#expect(dashed.style == "dashed" && dashed.offset == -1)
	let groove = try #require(layout.styles["h5"]?.outline)
	#expect(groove.tones == [
		RGBA(r: 141, g: 153, b: 174, alpha: 255), RGBA(r: 141, g: 153, b: 174, alpha: 255), RGBA(r: 73, g: 79, b: 90, alpha: 255),
	])
	#expect(layout.styles["h7"]?.outline == nil)
}

@Test func anOutlineInARowIsDrawnInTheTopViewAfterEarlierBoxesOutlines() throws {
	let layout = try outlines()
	let marked = try #require(layout.styles["h8"]?.outline)
	#expect(marked.host == "h0")
	#expect(marked.edges == [426, 999, 780, 1131])
	let order = try ["h2", "h3", "h4", "h5", "h8"].map { try #require(layout.styles[$0]?.outline).order }
	#expect(order == order.sorted() && Set(order).count == 5)
}

@Test func theOutlineFollowsItsWriteIntoAnotherAssignment() throws {
	let layout = try outlines()
	let narrow = try #require(layout.assignments[0]["h2"]?.outline)
	let wide = try #require(layout.assignments[1]["h2"]?.outline)
	#expect(narrow.width == 3 && narrow.offset == 4)
	#expect(wide.width == 6 && wide.offset == 8)
}

@Test func aBoxsOwnOutlineIsDrawnAfterItsDescendantsOutlines() throws {
	let solid: [String: Any] = [
		"kind": "outline", "style": "solid", "width": 2, "offset": 0, "color": ["r": 0, "g": 0, "b": 0, "alpha": 255],
		"tones": NSNull(), "radii": NSNull(), "layer": "html", "key": "dragonOutline.rings",
	]
	let layout = try outlines(adding(solid, to: "h6"))
	let row = try #require(layout.styles["h6"]?.outline)
	let cell = try #require(layout.styles["h8"]?.outline)
	#expect(cell.order < row.order)
}

@Test func refusesAnOutlineALaterLayerBoxIsPlacedOutsideOf() throws {
	let order: [String: Any] = ["kind": "paint-order", "host": "html", "bucket": 1, "rank": 0, "index": 0, "key": "dragonStacking.order"]
	#expect(refusal(adding(order, to: "h0")).contains("which html paints over outlines, is placed in the page"))
}

@Test func refusesAnOutlineInsideAClip() throws {
	#expect(refusal(adding(["kind": "padding-box-clip", "key": "dragonClip.frame"], to: "h6")).contains("past h6, which clips or scrolls"))
}

@Test func refusesAnOutlineWriteItCannotDraw() throws {
	#expect(refusal(outlineWrite(of: "h2") { $0["key"] = "dragonOutline.frame" }).contains("expected dragonOutline.rings"))
	#expect(refusal(outlineWrite(of: "h2") { $0["style"] = "auto" }).contains("outline style auto has no native paint"))
	#expect(refusal(outlineWrite(of: "h5") { $0["tones"] = NSNull() }).contains("a groove outline needs lighter and darker colours"))
	#expect(refusal(outlineWrite(of: "h3") { $0["width"] = 0 }).contains("outline width 0.0 or offset 0.0 is out of range"))
}
