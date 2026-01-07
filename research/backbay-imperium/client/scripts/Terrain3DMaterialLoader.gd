# gdlint:ignore = class-definitions-order
extends RefCounted
class_name Terrain3DMaterialLoader

## Loads and caches PBR materials for 3D terrain rendering.
## Maps terrain types to StandardMaterial3D with basecolor, normal, roughness maps.
## Water uses custom animated shaders for realistic ocean effects.

# Material paths - points to fab/backbay-imperium/assets/materials/
const MATERIAL_BASE_PATH := "res://assets/materials/"

# Shader material paths
const WATER_OCEAN_SHADER := "res://shaders/water_ocean.gdshader"
const WATER_COAST_SHADER := "res://shaders/water_coast.gdshader"
const WATER_LAKE_SHADER := "res://shaders/water_lake.gdshader"
const WATER_OCEAN_MATERIAL := "res://materials/water_ocean.tres"

# Terrain type to material mapping
const TERRAIN_MATERIAL_MAP := {
	"grassland": "mat_grass_meadow",
	"plains": "mat_grass_dry",
	"desert": "mat_sand_desert",
	"coast": "mat_sand_beach",
	"ocean": "mat_water_deep",
	"lake": "mat_water_shallow",
	"floodplain": "mat_grass_meadow",  # Lush green like Nile delta
	"tundra": "mat_snow_packed",
	"hills": "mat_grass_wild",
	"mountains": "mat_rock_granite",
	"marsh": "mat_mud_wet",
	"jungle": "mat_grass_lush",
	"forest": "mat_dirt_forest",
	"snow": "mat_snow_fresh",
}

# Fallback colors for terrains without PBR materials
const TERRAIN_FALLBACK_COLORS := {
	"grassland": Color(0.3, 0.6, 0.2),
	"plains": Color(0.7, 0.65, 0.4),
	"desert": Color(0.9, 0.8, 0.5),
	"coast": Color(0.2, 0.5, 0.7),
	"ocean": Color(0.1, 0.3, 0.6),
	"lake": Color(0.08, 0.45, 0.35),  # Bright turquoise freshwater
	"floodplain": Color(0.35, 0.55, 0.25),  # Lush fertile green
	"tundra": Color(0.8, 0.85, 0.9),
	"hills": Color(0.5, 0.55, 0.35),
	"mountains": Color(0.5, 0.5, 0.5),
	"marsh": Color(0.35, 0.45, 0.3),
	"jungle": Color(0.15, 0.4, 0.15),
	"forest": Color(0.2, 0.45, 0.2),
	"snow": Color(0.95, 0.97, 1.0),
}

var _material_cache: Dictionary = {}  # terrain_name -> StandardMaterial3D
var _texture_cache: Dictionary = {}   # path -> Texture2D
var _terrain_id_to_name: Dictionary = {}  # terrain_id -> terrain_name
var _water_material: Material = null  # ShaderMaterial or StandardMaterial3D
var _coast_material: Material = null  # ShaderMaterial or StandardMaterial3D
var _lake_material: Material = null   # ShaderMaterial for lake water
var _use_shader_water: bool = true  # Set to false to use legacy StandardMaterial3D


func apply_rules_catalog(catalog: Dictionary) -> void:
	"""Load terrain ID to name mapping from rules catalog."""
	_terrain_id_to_name.clear()

	var terrains = catalog.get("terrains", [])
	if typeof(terrains) != TYPE_ARRAY:
		return

	for t in terrains:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		var td: Dictionary = t
		var tid := _parse_runtime_id(td.get("id", -1))
		if tid < 0:
			continue

		var terrain_name := _normalize_label(td.get("ui_icon", null))
		if terrain_name.is_empty():
			terrain_name = _normalize_label(td.get("name", null))
		if not terrain_name.is_empty():
			_terrain_id_to_name[tid] = terrain_name


func get_material_for_terrain_id(terrain_id: int) -> StandardMaterial3D:
	"""Get or create a material for a terrain ID."""
	var terrain_name: String = _terrain_id_to_name.get(terrain_id, "grassland")
	return get_material_for_terrain(terrain_name)


func get_material_for_terrain(terrain_name: String) -> StandardMaterial3D:
	"""Get or create a material for a terrain type."""
	if _material_cache.has(terrain_name):
		return _material_cache[terrain_name]

	var material := _create_terrain_material(terrain_name)
	_material_cache[terrain_name] = material
	return material


func get_water_material() -> Material:
	"""Get the water material for ocean tiles. Uses animated shader if available."""
	if _water_material:
		return _water_material

	# Try to use shader-based water first
	if _use_shader_water:
		_water_material = _create_shader_water_material()
		if _water_material:
			return _water_material

	# Fallback to StandardMaterial3D
	_water_material = _create_standard_water_material()
	return _water_material


func _create_shader_water_material() -> ShaderMaterial:
	"""Create animated water shader material."""
	# Try to load pre-made material resource
	if ResourceLoader.exists(WATER_OCEAN_MATERIAL):
		var mat: ShaderMaterial = load(WATER_OCEAN_MATERIAL)
		if mat:
			return mat.duplicate()

	# Create shader material from scratch
	if not ResourceLoader.exists(WATER_OCEAN_SHADER):
		return null

	var shader: Shader = load(WATER_OCEAN_SHADER)
	if not shader:
		return null

	var mat := ShaderMaterial.new()
	mat.shader = shader

	# Set shader parameters
	mat.set_shader_parameter("deep_color", Vector3(0.02, 0.08, 0.18))
	mat.set_shader_parameter("shallow_color", Vector3(0.1, 0.35, 0.45))
	mat.set_shader_parameter("foam_color", Vector3(0.9, 0.95, 1.0))

	# Wave parameters - realistic small waves
	mat.set_shader_parameter("wave_speed", 0.04)
	mat.set_shader_parameter("wave_scale", 3.0)
	mat.set_shader_parameter("wave_strength", 0.08)

	mat.set_shader_parameter("wave2_scale", 1.2)
	mat.set_shader_parameter("wave2_speed", 0.015)
	mat.set_shader_parameter("wave2_strength", 0.04)

	mat.set_shader_parameter("ripple_scale", 12.0)
	mat.set_shader_parameter("ripple_speed", 0.08)
	mat.set_shader_parameter("ripple_strength", 0.03)

	# Vertex displacement
	mat.set_shader_parameter("vertex_wave_height", 0.015)

	# Surface
	mat.set_shader_parameter("metallic", 0.0)
	mat.set_shader_parameter("roughness", 0.05)
	mat.set_shader_parameter("specular", 0.6)

	# Fresnel
	mat.set_shader_parameter("fresnel_power", 4.0)
	mat.set_shader_parameter("fresnel_color", Vector3(0.6, 0.75, 0.85))

	# Alpha
	mat.set_shader_parameter("alpha", 0.92)

	# Load normal maps
	var normal1 := _load_texture(MATERIAL_BASE_PATH + "mat_water_deep_normal.png")
	if normal1:
		mat.set_shader_parameter("normal_map", normal1)

	var normal2 := _load_texture(MATERIAL_BASE_PATH + "mat_water_shallow_normal.png")
	if normal2:
		mat.set_shader_parameter("normal_map2", normal2)
	elif normal1:
		mat.set_shader_parameter("normal_map2", normal1)

	return mat


func _create_standard_water_material() -> StandardMaterial3D:
	"""Create legacy StandardMaterial3D water (no animation)."""
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.05, 0.15, 0.35, 1.0)
	mat.metallic = 0.1
	mat.roughness = 0.15
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	var water_base := _load_texture(MATERIAL_BASE_PATH + "mat_water_deep_basecolor.png")
	if water_base:
		mat.albedo_texture = water_base
		mat.albedo_color = Color(0.6, 0.7, 0.85, 1.0)

	var water_normal := _load_texture(MATERIAL_BASE_PATH + "mat_water_deep_normal.png")
	if water_normal:
		mat.normal_enabled = true
		mat.normal_texture = water_normal
		mat.normal_scale = 0.3  # Reduced from 0.8 for more subtle waves

	return mat


func get_coast_material() -> Material:
	"""Get the coast/shallow water material for coastline tiles."""
	if _coast_material:
		return _coast_material

	# Try shader-based coast first
	if _use_shader_water:
		_coast_material = _create_shader_coast_material()
		if _coast_material:
			return _coast_material

	# Fallback to StandardMaterial3D
	_coast_material = _create_standard_coast_material()
	return _coast_material


func _create_shader_coast_material() -> ShaderMaterial:
	"""Create animated coastal water shader material."""
	if not ResourceLoader.exists(WATER_COAST_SHADER):
		return null

	var shader: Shader = load(WATER_COAST_SHADER)
	if not shader:
		return null

	var mat := ShaderMaterial.new()
	mat.shader = shader

	# Shallow water colors
	mat.set_shader_parameter("shallow_color", Vector3(0.15, 0.45, 0.5))
	mat.set_shader_parameter("sand_tint", Vector3(0.7, 0.6, 0.4))
	mat.set_shader_parameter("foam_color", Vector3(0.95, 0.97, 1.0))

	# Gentler waves for shallow water
	mat.set_shader_parameter("wave_speed", 0.03)
	mat.set_shader_parameter("wave_scale", 4.0)
	mat.set_shader_parameter("wave_strength", 0.05)

	mat.set_shader_parameter("ripple_scale", 10.0)
	mat.set_shader_parameter("ripple_speed", 0.06)
	mat.set_shader_parameter("ripple_strength", 0.025)

	# Shore foam
	mat.set_shader_parameter("foam_amount", 0.4)
	mat.set_shader_parameter("foam_scale", 6.0)
	mat.set_shader_parameter("foam_speed", 0.02)
	mat.set_shader_parameter("foam_sharpness", 3.0)

	# Surface
	mat.set_shader_parameter("metallic", 0.0)
	mat.set_shader_parameter("roughness", 0.15)
	mat.set_shader_parameter("specular", 0.4)

	# Fresnel
	mat.set_shader_parameter("fresnel_power", 3.0)
	mat.set_shader_parameter("fresnel_color", Vector3(0.7, 0.85, 0.9))

	# Transparency
	mat.set_shader_parameter("alpha", 0.75)
	mat.set_shader_parameter("sand_visibility", 0.2)

	# Textures
	var normal := _load_texture(MATERIAL_BASE_PATH + "mat_water_shallow_normal.png")
	if not normal:
		normal = _load_texture(MATERIAL_BASE_PATH + "mat_water_deep_normal.png")
	if normal:
		mat.set_shader_parameter("normal_map", normal)

	var sand := _load_texture(MATERIAL_BASE_PATH + "mat_sand_beach_basecolor.png")
	if sand:
		mat.set_shader_parameter("sand_texture", sand)

	return mat


func _create_standard_coast_material() -> StandardMaterial3D:
	"""Create legacy StandardMaterial3D coast (no animation)."""
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.15, 0.4, 0.5, 0.85)
	mat.metallic = 0.05
	mat.roughness = 0.2
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	var beach_base := _load_texture(MATERIAL_BASE_PATH + "mat_sand_beach_basecolor.png")
	if beach_base:
		mat.albedo_texture = beach_base
		mat.albedo_color = Color(0.5, 0.7, 0.8, 0.8)

	var beach_normal := _load_texture(MATERIAL_BASE_PATH + "mat_sand_beach_normal.png")
	if beach_normal:
		mat.normal_enabled = true
		mat.normal_texture = beach_normal
		mat.normal_scale = 0.25

	return mat


func _create_terrain_material(terrain_name: String) -> StandardMaterial3D:
	"""Create a PBR material for a terrain type."""
	var material := StandardMaterial3D.new()

	# Get material name from mapping
	var mat_name: String = TERRAIN_MATERIAL_MAP.get(terrain_name, "")

	if mat_name.is_empty():
		# No PBR material, use fallback color
		material.albedo_color = TERRAIN_FALLBACK_COLORS.get(terrain_name, Color(0.5, 0.5, 0.5))
		material.roughness = 0.9
		return material

	# Try to load PBR textures
	var base_path := MATERIAL_BASE_PATH + mat_name

	var basecolor := _load_texture(base_path + "_basecolor.png")
	if basecolor:
		material.albedo_texture = basecolor
		material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS

	var normal := _load_texture(base_path + "_normal.png")
	if normal:
		material.normal_enabled = true
		material.normal_texture = normal
		material.normal_scale = 1.0

	var roughness := _load_texture(base_path + "_roughness.png")
	if roughness:
		material.roughness_texture = roughness
		material.roughness = 1.0  # Texture controls roughness
	else:
		# Default roughness for terrain
		material.roughness = 0.85

	# If no textures loaded, use fallback color
	if not basecolor:
		material.albedo_color = TERRAIN_FALLBACK_COLORS.get(terrain_name, Color(0.5, 0.5, 0.5))

	# UV scaling for tiling
	material.uv1_scale = Vector3(2.0, 2.0, 1.0)

	return material


func _load_texture(path: String) -> Texture2D:
	"""Load and cache a texture."""
	if _texture_cache.has(path):
		return _texture_cache[path]

	if not ResourceLoader.exists(path):
		return null

	var tex: Texture2D = load(path)
	if tex:
		_texture_cache[path] = tex
	return tex


func _parse_runtime_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
	return int(value)


func _normalize_label(value: Variant) -> String:
	if typeof(value) != TYPE_STRING:
		return ""
	var label := String(value).strip_edges().to_lower()
	return label.replace(" ", "_")


func get_lake_material() -> Material:
	"""Get the lake water material. Uses animated shader for calm freshwater."""
	if _lake_material:
		return _lake_material

	# Try shader-based lake first
	if _use_shader_water:
		_lake_material = _create_shader_lake_material()
		if _lake_material:
			return _lake_material

	# Fallback to StandardMaterial3D
	_lake_material = _create_standard_lake_material()
	return _lake_material


func _create_shader_lake_material() -> ShaderMaterial:
	"""Create animated lake water shader material."""
	if not ResourceLoader.exists(WATER_LAKE_SHADER):
		return null

	var shader: Shader = load(WATER_LAKE_SHADER)
	if not shader:
		return null

	var mat := ShaderMaterial.new()
	mat.shader = shader

	# Lake water colors - distinctly GREEN/TURQUOISE freshwater
	mat.set_shader_parameter("deep_color", Vector3(0.02, 0.25, 0.20))      # Deep teal-green
	mat.set_shader_parameter("shallow_color", Vector3(0.08, 0.45, 0.35))  # Bright turquoise
	mat.set_shader_parameter("shore_color", Vector3(0.15, 0.55, 0.42))    # Emerald shore

	# Gentle wave parameters
	mat.set_shader_parameter("wave_speed", 0.025)
	mat.set_shader_parameter("wave_scale", 4.0)
	mat.set_shader_parameter("wave_strength", 0.04)

	mat.set_shader_parameter("wave2_scale", 2.0)
	mat.set_shader_parameter("wave2_speed", 0.012)
	mat.set_shader_parameter("wave2_strength", 0.025)

	mat.set_shader_parameter("ripple_scale", 15.0)
	mat.set_shader_parameter("ripple_speed", 0.06)
	mat.set_shader_parameter("ripple_strength", 0.02)

	# Very subtle vertex displacement
	mat.set_shader_parameter("vertex_wave_height", 0.008)

	# Surface properties - more reflective
	mat.set_shader_parameter("metallic", 0.0)
	mat.set_shader_parameter("roughness", 0.03)
	mat.set_shader_parameter("specular", 0.7)

	# Fresnel - green-tinted for freshwater
	mat.set_shader_parameter("fresnel_power", 3.5)
	mat.set_shader_parameter("fresnel_color", Vector3(0.55, 0.85, 0.75))  # Green-white reflection

	# Transparency
	mat.set_shader_parameter("alpha", 0.88)
	mat.set_shader_parameter("bottom_visibility", 0.15)

	# Caustics
	mat.set_shader_parameter("caustic_scale", 8.0)
	mat.set_shader_parameter("caustic_speed", 0.03)
	mat.set_shader_parameter("caustic_intensity", 0.1)

	# Load normal map
	var normal := _load_texture(MATERIAL_BASE_PATH + "mat_water_shallow_normal.png")
	if not normal:
		normal = _load_texture(MATERIAL_BASE_PATH + "mat_water_deep_normal.png")
	if normal:
		mat.set_shader_parameter("normal_map", normal)

	return mat


func _create_standard_lake_material() -> StandardMaterial3D:
	"""Create legacy StandardMaterial3D lake (no animation)."""
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.08, 0.45, 0.35, 0.9)  # Turquoise freshwater
	mat.metallic = 0.05
	mat.roughness = 0.08
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	var water_base := _load_texture(MATERIAL_BASE_PATH + "mat_water_shallow_basecolor.png")
	if water_base:
		mat.albedo_texture = water_base
		mat.albedo_color = Color(0.55, 0.75, 0.8, 0.9)

	var water_normal := _load_texture(MATERIAL_BASE_PATH + "mat_water_shallow_normal.png")
	if water_normal:
		mat.normal_enabled = true
		mat.normal_texture = water_normal
		mat.normal_scale = 0.2  # Very subtle for calm lake

	return mat


func get_terrain_height(terrain_name: String) -> float:
	"""Get the height offset for a terrain type."""
	match terrain_name:
		"mountains":
			return 0.45
		"hills":
			return 0.22
		"coast":
			return -0.08  # Shallow water level, just above ocean water plane
		"ocean":
			return -0.12  # Matches water_y in HexMeshGenerator
		"lake":
			return 0.0  # At land level - distinct from ocean water plane
		"floodplain":
			return 0.02  # Slightly lower than regular land
		"marsh":
			return 0.0  # Low wetland
		_:
			return 0.06  # Slight height for all land tiles
