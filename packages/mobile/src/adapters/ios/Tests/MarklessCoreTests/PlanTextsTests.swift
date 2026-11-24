import Foundation
@testable import MarklessCore
import Testing

private func textExport(slots: Bool = false) -> Data {
	Data("""
	{"schema":"dragon.native-style-export/1","units":"frames and borderWidths in device px, frames relative to the parent box; lengths inside writes in CSS px",
	"fonts":[],"slots":[\(slots ? #"{"id":"slot:0","initial":0,"integer":true}"# : "")],
	"targets":{"ios":{"backend":"uikit","viewport":{"width":100,"height":100},"dpr":1,"states":[],"initial":0,"next":[[]],
	"plan":{"version":"dragon.markless-plan/1"},
	"assignments":[{"values":{},"nodes":[
	{"id":"h0","parent":null,"kind":"element","native":"DragonBoxView","text":null,"frame":{"x":0,"y":0,"width":10,"height":10},"borderWidths":null,"writes":[]},
	{"id":"h0:text0","parent":"h0","kind":"text","native":"DragonTextView","text":"Home","frame":{"x":0,"y":0,"width":10,"height":10},"borderWidths":null,"writes":[]}]}]}}}
	""".utf8)
}

private func hex(_ value: Double) -> String {
	let digits = String(value.bitPattern, radix: 16)
	return "\"" + String(repeating: "0", count: 16 - digits.count) + digits + "\""
}

private func answer(height: Double) -> String {
	let box = [0, 0, 10, height].map { hex($0) }.joined(separator: ",")
	return "[\"ok\",[\(hex(0)),\(hex(0)),\(hex(0)),\(hex(0))],[[\"h0\",[\(box)],null,null,null,null],[\"h0:text0\",[\(box)],null,null,null,null]]]"
}

@Test func aPageTextThatChangedGoesToTheLiveLayoutBesideNoRows() throws {
	let style = try StyleExport.decode(textExport())
	var live: [String] = []
	let relaid = try style.laidOut(
		width: 100, height: 100, scale: 1, layout: { _ in Issue.record("laid out without the texts"); return answer(height: 10) },
		rowsLayout: { line in live.append(line); return answer(height: 30) }, texts: ["h0:text0": "Home and the garden shed"])
	#expect(live.count == 1)
	#expect(live.first?.hasSuffix(#","rows":[],"texts":[["h0:text0","Home and the garden shed"]],"sticky":true,"textAreas":true}"#) == true)
	#expect(relaid.assignments[0].nodes.first { $0.id == "h0" }?.frame?.height == 30)
}

@Test func anEntryThePageDoesNotShowKeepsTheBoxesItHadUntilItIsLaidOut() throws {
	let style = try StyleExport.decode(textExport())
	let height = { (export: StyleExport) in export.assignments[0].nodes.first { $0.id == "h0" }?.frame?.height }
	let first = try style.laidOut(width: 100, height: 100, scale: 1, layout: { _ in answer(height: 10) }, texts: ["h0:text0": "Home"])
	let kept = try style.laidOut(
		width: 200, height: 100, scale: 1, layout: { _ in Issue.record("laid out an entry the page does not show"); return answer(height: 20) },
		texts: ["h0:text0": "Home"], entries: [], previous: first)
	#expect(height(kept) == height(first))
	let shown = try style.laidOut(width: 200, height: 100, scale: 1, layout: { _ in answer(height: 20) }, texts: ["h0:text0": "Home"], entries: [0], previous: first)
	#expect(height(shown) == 20)
}

@Test func aPageTextAtItsLaidOutStringKeepsTheRecordedLayout() throws {
	let style = try StyleExport.decode(textExport())
	var replayed = 0
	_ = try style.laidOut(
		width: 100, height: 100, scale: 1, layout: { line in replayed += 1; #expect(!line.contains("texts")); return answer(height: 10) },
		rowsLayout: { _ in Issue.record("used the live layout"); return answer(height: 10) }, texts: ["h0:text0": "Home"])
	#expect(replayed == 1)
}

@Test func aPageTextThatChangedBesideSlotsGoesToTheLiveLayoutWithBoth() throws {
	let style = try StyleExport.decode(textExport(slots: true))
	var live: [String] = []
	_ = try style.laidOut(
		width: 100, height: 100, scale: 1, slots: [0], layout: { _ in Issue.record("laid out without the texts"); return "" },
		rowsLayout: { line in live.append(line); return answer(height: 10).replacingOccurrences(of: "]]]", with: "]],[],[]]") }, texts: ["h0:text0": "Longer"])
	#expect(live.count == 1)
	#expect(live.first?.contains(#""slots":["#) == true)
	#expect(live.first?.hasSuffix(#","rows":[],"texts":[["h0:text0","Longer"]],"sticky":true,"textAreas":true}"#) == true)
}
