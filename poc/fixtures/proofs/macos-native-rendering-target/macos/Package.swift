// swift-tools-version: 6.0

import PackageDescription

let package = Package(
	name: "ArcadeDesktopProof",
	platforms: [
		.macOS(.v14),
	],
	products: [
		.library(name: "ArcadeDesktopProof", targets: ["ArcadeDesktopProof"]),
	],
	targets: [
		.target(
			name: "ArcadeDesktopProof",
			resources: [
				.process("Resources"),
			],
		),
		.testTarget(
			name: "ArcadeDesktopProofTests",
			dependencies: ["ArcadeDesktopProof"],
		),
	],
)
