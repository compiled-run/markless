import Foundation
@testable import MarklessCore
import Testing

private let scrollVectors: URL = {
	var url = URL(fileURLWithPath: #filePath)
	for _ in 0..<6 { url.deleteLastPathComponent() }
	return url.appendingPathComponent("conformance/scroll/scroll-into-view.json")
}()

private func rect(_ reader: Reader) throws -> ScrollRect {
	let f = try reader.object(["x", "y", "width", "height"])
	return ScrollRect(x: try f["x"].number(), y: try f["y"].number(), width: try f["width"].number(), height: try f["height"].number())
}

private func point(_ reader: Reader) throws -> (x: Double, y: Double) {
	let f = try reader.object(["x", "y"])
	return (try f["x"].number(), try f["y"].number())
}

@Test func reproducesScrollIntoViewVectors() throws {
	let root = try Reader(JSONValue.parse(Data(contentsOf: scrollVectors)), at: "scroll")
	let file = try root.object(["version", "cases"])
	#expect(try file["version"].string() == "markless.native-scroll/0")
	let cases = try file["cases"].array()
	#expect(!cases.isEmpty)
	for entry in cases {
		let c = try entry.object(["name", "chain", "target", "align", "offsets"])
		let chain = try c["chain"].array().map { box in
			let b = try box.object(["port", "offset", "range"])
			let r = try b["range"].object(["minX", "maxX", "minY", "maxY"])
			return ScrollBox(
				port: try rect(b["port"]), offset: try point(b["offset"]),
				range: ScrollOffsetRange(minX: try r["minX"].number(), maxX: try r["maxX"].number(), minY: try r["minY"].number(), maxY: try r["maxY"].number()))
		}
		let align = try c["align"].object(["block", "inline"])
		let block = try #require(ScrollAlign(rawValue: try align["block"].string()))
		let inline = try #require(ScrollAlign(rawValue: try align["inline"].string()))
		let got = scrollIntoView(chain, target: try rect(c["target"]), block: block, inline: inline)
		let want = try c["offsets"].array().map(point)
		let name = try c["name"].string()
		#expect(got.map { [$0.x, $0.y] } == want.map { [$0.x, $0.y] }, "\(name)")
	}
}
