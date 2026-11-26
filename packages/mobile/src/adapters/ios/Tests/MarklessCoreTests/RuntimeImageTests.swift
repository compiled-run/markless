import Foundation
@testable import MarklessCore
import Testing

// The S30 rung's app style and payload as the harness builds them (proofs/s30-runtime-image, Dragon branch cw/img-dynamic-src-paint):
// a card template whose img src follows its row, and a thumbnail whose src can be absent.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func gallery() throws -> (StyleExport, NativeViewPayload) {
	let styles = try StyleExport.decodeApp(try fixture("s30-runtime-image.native-app-style"))
	guard case let .app(app) = try NativePayload.decode(try fixture("s30-runtime-image.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	return (try #require(styles["/"]), try #require(app.routes.first { $0.pattern == "/" }).page)
}

private func bits(_ value: Double) -> String {
	let hex = String(value.bitPattern, radix: 16)
	return "\"" + String(repeating: "0", count: 16 - hex.count) + hex + "\""
}

@Test func aRuntimeImageWriteKeepsItsFitPositionOutlineAndContentBox() throws {
	let (style, _) = try gallery()
	let nodes = style.assignments[style.initial].nodes
	let card = try #require(nodes.first { $0.id == "h5" }?.runtimeImage)
	let thumb = try #require(nodes.first { $0.id == "h8" }?.runtimeImage)
	#expect(card.fit == "cover")
	#expect(card.position == [.init(percent: true, value: 50), .init(percent: true, value: 50)])
	#expect(card.outline == nil)
	#expect(thumb.fit == "contain")
	#expect(thumb.position == [.init(percent: true, value: 0), .init(percent: true, value: 100)])
	#expect(thumb.outline == RGBA(r: 192, g: 192, b: 192, alpha: 255))
	#expect(thumb.content == Frame(x: 3456, y: 38880, width: 13824, height: 13824))
	#expect(nodes.filter { $0.runtimeImage != nil }.map(\.id) == ["h5", "h8"])
}

@Test func aRuntimeImageIsPlacedAtItsContentBoxInsideItsBorders() throws {
	let (style, page) = try gallery()
	let runtime = NativeRuntime(payload: page)
	let layout = try style.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:))
	let thumb = try #require(layout.styles["h8"]?.runtimeImage)
	#expect(thumb.scale == 3)
	#expect(thumb.place.content == Frame(x: 54, y: 607.5, width: 216, height: 216))
	// The content box sits inside the 2px border: 6 device px in from the frame's absolute origin.
	#expect(thumb.place.originX == 48)
	#expect(thumb.place.originY == 601.5)
	#expect(layout.styles["h5"]?.runtimeImage?.image.fit == "cover")
}

@Test func aPhoneLayoutPlacesTheContentBoxFromItsOwnFrameAndTheExportsPadding() throws {
	let (style, _) = try gallery()
	let k = style.initial
	let dragonId = Dictionary(style.planNames[k].map { ($1, $0) }, uniquingKeysWith: { a, _ in a })
	// Every box 30 device px further right and its frame as the export's, at a phone 2 points narrower.
	var absolute: [String: Bool] = [:]
	let rows = style.assignments[k].nodes.compactMap { node -> String? in
		guard let f = node.frame else { return nil }
		let top = node.parent.map { absolute[$0] == nil } ?? true
		absolute[node.id] = true
		let frame = [top ? f.x + 30 : f.x, f.y, f.width, f.height].map(bits).joined(separator: ",")
		let w = node.borderWidths.map { "[" + [$0.top, $0.right, $0.bottom, $0.left].map(bits).joined(separator: ",") + "]" } ?? "null"
		return "[\"\(dragonId[node.id] ?? node.id)\",[\(frame)],\(w),null,null,null]"
	}
	let answer = "[\"ok\",[\([0.0, 0.0, 0.0, 0.0].map(bits).joined(separator: ","))],[\(rows.joined(separator: ","))]]"
	let laid = try style.laidOut(width: 400, height: 778, scale: 3, layout: { _ in answer })
	let thumb = try #require(laid.assignments[k].nodes.first { $0.id == "h8" }?.runtimeImagePlace)
	#expect(thumb.content == Frame(x: 84, y: 607.5, width: 216, height: 216))
	#expect(thumb.originX == 78)
}

@Test func aRuntimeImageWriteWithAnotherOutlineWidthIsRefused() throws {
	let text = String(decoding: try fixture("s30-runtime-image.native-app-style"), as: UTF8.self)
		.replacingOccurrences(of: "\"alpha\":255},\"width\":1}", with: "\"alpha\":255},\"width\":2}")
	#expect(throws: PayloadError.self) { try StyleExport.decodeApp(Data(text.utf8)) }
}
