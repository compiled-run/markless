import Foundation
@testable import MarklessCore
import Testing

// The u18 rung (base.visuallyhidden, its inline style through Dragon's cw/dragon-bugs-inline-style): its export and payload.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func resolved(_ edit: (String) -> String = { $0 }) throws -> StyleLayout {
	let payload = try NativeViewPayload.decode(try JSONValue.parse(try fixture("u18-visually-hidden.payload")))
	let runtime = NativeRuntime(payload: payload)
	let export = Data(edit(String(decoding: try fixture("u18-visually-hidden.native-style"), as: UTF8.self)).utf8)
	return try StyleExport.decode(export).resolve(for: payload, initialTexts: try runtime.texts(), value: runtime.value(of:))
}

@Test func theVisuallyHiddenSpanClipsToNothing() throws {
	let span = try #require(try resolved().styles["component-edge:0/h0"])
	#expect(span.clipsChildren)
	#expect(span.clipRect == Frame(x: 0, y: 0, width: 0, height: 0))
	#expect(span.frame?.width == 1)
	let card = try #require(try resolved().styles["h2"])
	#expect(card.clipRect == nil)
	#expect(!card.clipsChildren)
}

@Test func aBoxThatPaintsInAnotherStackingOrderIsPlacedInItsStackingParentUnlessItPaintsNothing() throws {
	#expect(try resolved().styles["component-edge:0/h0"]?.stackingParent == nil)
	// inset(0) leaves the whole box, so its re-hosted paint order matters: it is placed in the page's top box, in that order.
	let edited = { (s: String) in s.replacingOccurrences(of: "\"value\": 50", with: "\"value\": 0") }
	let span = try #require(try resolved(edited).styles["component-edge:0/h0"])
	#expect(span.stackingParent == "h0")
	#expect(span.paintOrder?.bucket == 1)
}

/// u18's export with the clipping span given solid borders (device px, top right bottom left), a radius (16 px) and side colours.
private func bordered(_ widths: [Double], colors: [[String: Int]]? = nil, radius: Double = 16) throws -> StyleLayout {
	try resolved { text in
		var root = try! JSONSerialization.jsonObject(with: Data(text.utf8)) as! [String: Any]
		var targets = root["targets"] as! [String: Any]
		var ios = targets["ios"] as! [String: Any]
		ios["assignments"] = (ios["assignments"] as! [[String: Any]]).map { assignment in
			var assignment = assignment
			assignment["nodes"] = (assignment["nodes"] as! [[String: Any]]).map { node in
				guard node["id"] as? String == "component-edge:0/h0" else { return node }
				var node = node
				node["frame"] = ["x": 42, "y": 197, "width": 300, "height": 150]
				node["borderWidths"] = ["top": widths[0], "right": widths[1], "bottom": widths[2], "left": widths[3]]
				var writes = (node["writes"] as! [[String: Any]]).filter { $0["kind"] as? String != "clip-path-inset" }
				for k in writes.indices {
					if writes[k]["kind"] as? String == "border-styles" { writes[k]["styles"] = ["solid", "solid", "solid", "solid"] }
					if writes[k]["kind"] as? String == "border-colors", let colors { writes[k]["colors"] = colors.map { $0.merging(["alpha": 255]) { a, _ in a } } }
				}
				writes.append(["kind": "border-radius", "lengths": Array(repeating: ["percent": false, "value": radius], count: 8), "key": "dragonRadius.radiiPx"])
				node["writes"] = writes
				return node
			}
			return assignment
		}
		targets["ios"] = ios
		root["targets"] = targets
		return String(decoding: try! JSONSerialization.data(withJSONObject: root), as: UTF8.self)
	}
}

@Test func aBoxWithBordersClipsItsChildrenToItsPaddingBoxWithCornersShapedByTheBorders() throws {
	let even = try #require(try bordered([18, 18, 18, 18]).styles["component-edge:0/h0"])
	#expect(even.clipsChildren)
	#expect(even.childClip == PaddingBox(radius: 16, top: 6, right: 6, bottom: 6, left: 6))
	#expect(even.childClip?.corners.allSatisfy { $0 == PaddingBox.Corner(x: 10, y: 10) } == true)
	#expect(even.borderWidth == 6 && even.cornerRadius == 16)
	let uneven = try #require(try bordered([6, 30, 6, 30]).styles["component-edge:0/h0"])
	#expect(uneven.childClip?.left == 10 && uneven.childClip?.top == 2)
	#expect(uneven.childClip?.corners.allSatisfy { $0 == PaddingBox.Corner(x: 6, y: 14) } == true)
	#expect(uneven.sides?.map(\.width) == [2, 10, 2, 10])
	#expect(try resolved().styles["component-edge:0/h0"]?.childClip == nil)
}

@Test func aPillRadiusShrinksToHalfTheShorterSideAsCSSOverlappingCornersDo() throws {
	let pill = try #require(try bordered([3, 3, 3, 3], radius: 999).styles["component-edge:0/h0"])
	#expect(pill.cornerRadius == 25)
	#expect(pill.childClip == PaddingBox(radius: 25, top: 1, right: 1, bottom: 1, left: 1))
}

@Test func anInnerCornerNeverGoesBelowZero() {
	let box = PaddingBox(radius: 8, top: 4, right: 20, bottom: 30, left: 1)
	#expect(box.corners == [.init(x: 7, y: 4), .init(x: 0, y: 4), .init(x: 0, y: 0), .init(x: 7, y: 0)])
}

@Test func roundedSidesOfDifferentColoursAreRefusedByName() throws {
	let colors = [["r": 255, "g": 0, "b": 0], ["r": 0, "g": 0, "b": 255], ["r": 255, "g": 0, "b": 0], ["r": 0, "g": 0, "b": 255]]
	#expect(throws: PayloadError.self) { try bordered([6, 30, 6, 30], colors: colors) }
	do { _ = try bordered([6, 30, 6, 30], colors: colors) } catch { #expect("\(error)".contains("border sides of different colours, with rounded corners")) }
}

/// u18's export with the clipping span given an outline drawn in `layer`'s view.
private func outlined(layer: String) throws -> StyleLayout {
	try resolved { text in
		var root = try! JSONSerialization.jsonObject(with: Data(text.utf8)) as! [String: Any]
		var targets = root["targets"] as! [String: Any]
		var ios = targets["ios"] as! [String: Any]
		ios["assignments"] = (ios["assignments"] as! [[String: Any]]).map { assignment in
			var assignment = assignment
			assignment["nodes"] = (assignment["nodes"] as! [[String: Any]]).map { node in
				guard node["id"] as? String == "component-edge:0/h0" else { return node }
				var node = node
				node["writes"] = (node["writes"] as! [[String: Any]]).filter { $0["kind"] as? String != "clip-path-inset" } + [[
					"kind": "outline", "style": "solid", "width": 3, "offset": 2, "color": ["r": 0, "g": 0, "b": 0, "alpha": 255],
					"tones": NSNull(), "radii": NSNull(), "layer": layer, "key": "dragonOutline.rings",
				]]
				return node
			}
			return assignment
		}
		targets["ios"] = ios
		root["targets"] = targets
		return String(decoding: try! JSONSerialization.data(withJSONObject: root), as: UTF8.self)
	}
}

@Test func aBoxThatClipsAndDrawsItsOwnOutlineClipsItsChildrenInAClipViewSoTheOutlineBesideItStaysWhole() throws {
	let own = try #require(try outlined(layer: "component-edge:0/h0").styles["component-edge:0/h0"])
	#expect(own.clipsChildren)
	#expect(own.childClip == PaddingBox(radius: own.cornerRadius, top: 0, right: 0, bottom: 0, left: 0))
	#expect(try outlined(layer: "h0").styles["component-edge:0/h0"]?.childClip == nil)
}
