extends RefCounted
class_name TerrainColors

## Terrain type IDs (matching backbay-core/src/mapgen.rs)
const OCEAN := 0
const COAST := 1
const GRASSLAND := 2
const PLAINS := 3
const DESERT := 4
const TUNDRA := 5
const SNOW := 6
const HILLS := 7
const MOUNTAINS := 8
const FOREST := 9
const JUNGLE := 10
const MARSH := 11

## Terrain fill colors
static var TERRAIN_COLORS: Dictionary = {
	OCEAN: Color(0.12, 0.22, 0.45, 1.0),      # Deep blue
	COAST: Color(0.25, 0.45, 0.65, 1.0),      # Light blue
	GRASSLAND: Color(0.35, 0.55, 0.25, 1.0),  # Green
	PLAINS: Color(0.65, 0.55, 0.35, 1.0),     # Tan/yellow
	DESERT: Color(0.85, 0.75, 0.45, 1.0),     # Sand yellow
	TUNDRA: Color(0.55, 0.60, 0.55, 1.0),     # Gray-green
	SNOW: Color(0.92, 0.95, 0.98, 1.0),       # White
	HILLS: Color(0.45, 0.50, 0.35, 1.0),      # Dark green-brown
	MOUNTAINS: Color(0.45, 0.42, 0.40, 1.0),  # Gray
	FOREST: Color(0.18, 0.40, 0.18, 1.0),     # Dark green
	JUNGLE: Color(0.12, 0.35, 0.15, 1.0),     # Dense green
	MARSH: Color(0.35, 0.45, 0.40, 1.0),      # Muddy green
}

## Resource type IDs (matching backbay-core/src/mapgen.rs)
const RES_WHEAT := 0
const RES_CATTLE := 1
const RES_HORSES := 2
const RES_IRON := 3
const RES_COAL := 4
const RES_OIL := 5
const RES_GOLD := 6
const RES_GEMS := 7
const RES_FISH := 8
const RES_STONE := 9

## Resource colors for indicators
static var RESOURCE_COLORS: Dictionary = {
	RES_WHEAT: Color(0.95, 0.85, 0.35, 1.0),   # Golden yellow
	RES_CATTLE: Color(0.65, 0.45, 0.30, 1.0),  # Brown
	RES_HORSES: Color(0.50, 0.35, 0.25, 1.0),  # Dark brown
	RES_IRON: Color(0.50, 0.50, 0.55, 1.0),    # Gray metallic
	RES_COAL: Color(0.20, 0.20, 0.22, 1.0),    # Dark gray
	RES_OIL: Color(0.15, 0.15, 0.18, 1.0),     # Black
	RES_GOLD: Color(1.0, 0.85, 0.0, 1.0),      # Bright gold
	RES_GEMS: Color(0.55, 0.20, 0.70, 1.0),    # Purple
	RES_FISH: Color(0.40, 0.65, 0.85, 1.0),    # Light blue
	RES_STONE: Color(0.60, 0.58, 0.55, 1.0),   # Stone gray
}

## Resource symbols (Unicode)
static var RESOURCE_SYMBOLS: Dictionary = {
	RES_WHEAT: "W",
	RES_CATTLE: "C",
	RES_HORSES: "H",
	RES_IRON: "I",
	RES_COAL: "K",
	RES_OIL: "O",
	RES_GOLD: "G",
	RES_GEMS: "D",
	RES_FISH: "F",
	RES_STONE: "S",
}

static func get_terrain_color(terrain_id: int) -> Color:
	if TERRAIN_COLORS.has(terrain_id):
		return TERRAIN_COLORS[terrain_id]
	return Color(0.3, 0.3, 0.3, 1.0)  # Default gray

static func get_resource_color(resource_id: int) -> Color:
	if RESOURCE_COLORS.has(resource_id):
		return RESOURCE_COLORS[resource_id]
	return Color(1.0, 1.0, 1.0, 1.0)  # Default white

static func get_resource_symbol(resource_id: int) -> String:
	if RESOURCE_SYMBOLS.has(resource_id):
		return RESOURCE_SYMBOLS[resource_id]
	return "?"

static func get_terrain_name(terrain_id: int) -> String:
	match terrain_id:
		OCEAN: return "Ocean"
		COAST: return "Coast"
		GRASSLAND: return "Grassland"
		PLAINS: return "Plains"
		DESERT: return "Desert"
		TUNDRA: return "Tundra"
		SNOW: return "Snow"
		HILLS: return "Hills"
		MOUNTAINS: return "Mountains"
		FOREST: return "Forest"
		JUNGLE: return "Jungle"
		MARSH: return "Marsh"
		_: return "Unknown"

static func is_water(terrain_id: int) -> bool:
	return terrain_id == OCEAN or terrain_id == COAST

static func is_impassable(terrain_id: int) -> bool:
	return terrain_id == OCEAN or terrain_id == MOUNTAINS
