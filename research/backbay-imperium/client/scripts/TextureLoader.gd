# gdlint:ignore = class-definitions-order
extends RefCounted
class_name TextureLoader

## Loads and caches terrain, resource, and feature sprites.
## Maps from runtime IDs to preloaded textures.

const TERRAIN_PATH := "res://assets/terrain/"
const RESOURCE_PATH := "res://assets/resources/"
const BUILDING_PATH := "res://assets/buildings/"
const UNIT_PATH := "res://assets/units/"
const IMPROVEMENT_PATH := "res://assets/improvements/"
const DEFAULT_DIRECTION := "north"

var terrain_textures: Dictionary = {}     # terrain_id -> Texture2D
var terrain_names: Dictionary = {}        # terrain_id -> String (e.g., "plains")
var resource_textures: Dictionary = {}    # resource_id -> Texture2D
var resource_names: Dictionary = {}       # resource_id -> String
var feature_textures: Dictionary = {}     # feature_name -> Texture2D
var building_textures: Dictionary = {}    # building_id -> Texture2D
var building_names: Dictionary = {}       # building_id -> String
var unit_textures: Dictionary = {}        # unit_type_id -> Texture2D
var unit_names: Dictionary = {}           # unit_type_id -> String
var improvement_textures: Dictionary = {} # improvement_id -> Texture2D
var improvement_names: Dictionary = {}    # improvement_id -> String

var _texture_cache: Dictionary = {}       # path -> Texture2D


func apply_rules_catalog(catalog: Dictionary) -> void:
	terrain_textures.clear()
	terrain_names.clear()
	resource_textures.clear()
	resource_names.clear()
	feature_textures.clear()
	building_textures.clear()
	building_names.clear()
	unit_textures.clear()
	unit_names.clear()
	improvement_textures.clear()
	improvement_names.clear()

	var terrains = catalog.get("terrains", [])
	if typeof(terrains) == TYPE_ARRAY:
		for t in terrains:
			if typeof(t) != TYPE_DICTIONARY:
				continue
			var td: Dictionary = t
			var tid := _parse_runtime_id(td.get("id", -1))
			if tid < 0:
				continue

			var icon_name := _normalize_label(td.get("ui_icon", null))
			if icon_name.is_empty():
				icon_name = _normalize_label(td.get("name", null))
			if not icon_name.is_empty():
				terrain_names[tid] = icon_name
				var tex := _load_terrain_texture(icon_name, DEFAULT_DIRECTION)
				if tex:
					terrain_textures[tid] = tex

	var resources = catalog.get("resources", [])
	if typeof(resources) == TYPE_ARRAY:
		for r in resources:
			if typeof(r) != TYPE_DICTIONARY:
				continue
			var rd: Dictionary = r
			var rid := _parse_runtime_id(rd.get("id", -1))
			if rid < 0:
				continue

			var icon = rd.get("ui_icon", null)
			if typeof(icon) == TYPE_STRING:
				var icon_name := String(icon).strip_edges().to_lower()
				if not icon_name.is_empty():
					resource_names[rid] = icon_name
					var tex := _load_resource_texture(icon_name)
					if tex:
						resource_textures[rid] = tex

	# Load unit type textures
	var unit_types = catalog.get("unit_types", [])
	if typeof(unit_types) == TYPE_ARRAY:
		for u in unit_types:
			if typeof(u) != TYPE_DICTIONARY:
				continue
			var ud: Dictionary = u
			var uid := _parse_runtime_id(ud.get("id", -1))
			if uid < 0:
				continue

			# Use the unit name as the texture key (e.g., "warrior", "archer")
			var unit_name = ud.get("name", "")
			if typeof(unit_name) == TYPE_STRING:
				var name_key := String(unit_name).strip_edges().to_lower().replace(" ", "_")
				if not name_key.is_empty():
					unit_names[uid] = name_key
					var tex := _load_unit_texture(name_key)
					if tex:
						unit_textures[uid] = tex

	# Load building textures
	var buildings = catalog.get("buildings", [])
	if typeof(buildings) == TYPE_ARRAY:
		for b in buildings:
			if typeof(b) != TYPE_DICTIONARY:
				continue
			var bd: Dictionary = b
			var bid := _parse_runtime_id(bd.get("id", -1))
			if bid < 0:
				continue

			var building_name = bd.get("name", "")
			if typeof(building_name) == TYPE_STRING:
				var name_key := String(building_name).strip_edges().to_lower().replace(" ", "_")
				if not name_key.is_empty():
					building_names[bid] = name_key
					var tex := _load_building_texture(name_key)
					if tex:
						building_textures[bid] = tex

	# Load improvement textures
	var improvements = catalog.get("improvements", [])
	if typeof(improvements) == TYPE_ARRAY:
		for i in improvements:
			if typeof(i) != TYPE_DICTIONARY:
				continue
			var id_data: Dictionary = i
			var iid := _parse_runtime_id(id_data.get("id", -1))
			if iid < 0:
				continue

			var impr_name = id_data.get("name", "")
			if typeof(impr_name) == TYPE_STRING:
				var name_key := String(impr_name).strip_edges().to_lower().replace(" ", "_")
				if not name_key.is_empty():
					improvement_names[iid] = name_key
					var tex := _load_improvement_texture(name_key)
					if tex:
						improvement_textures[iid] = tex

	_preload_features()


func terrain_texture(terrain_id: int) -> Texture2D:
	if terrain_textures.has(terrain_id):
		return terrain_textures[terrain_id]
	return null


func resource_texture(resource_id: int) -> Texture2D:
	if resource_textures.has(resource_id):
		return resource_textures[resource_id]
	return null


func feature_texture(feature_name: String) -> Texture2D:
	var key := feature_name.to_lower()
	if feature_textures.has(key):
		return feature_textures[key]
	return null


func unit_texture(unit_type_id: int) -> Texture2D:
	if unit_textures.has(unit_type_id):
		return unit_textures[unit_type_id]
	return null


func building_texture(building_id: int) -> Texture2D:
	if building_textures.has(building_id):
		return building_textures[building_id]
	return null


func improvement_texture(improvement_id: int) -> Texture2D:
	if improvement_textures.has(improvement_id):
		return improvement_textures[improvement_id]
	return null


func _load_terrain_texture(name: String, direction: String) -> Texture2D:
	var path := TERRAIN_PATH + "terrain_" + name + "_" + direction + ".png"
	return _load_texture(path)


func _load_resource_texture(name: String) -> Texture2D:
	var path := RESOURCE_PATH + "resource_" + name + ".png"
	return _load_texture(path)


func _load_unit_texture(name: String) -> Texture2D:
	var path := UNIT_PATH + name + ".png"
	return _load_texture(path)


func _load_building_texture(name: String) -> Texture2D:
	var path := BUILDING_PATH + name + ".png"
	return _load_texture(path)


func _load_improvement_texture(name: String) -> Texture2D:
	var path := IMPROVEMENT_PATH + name + ".png"
	return _load_texture(path)


func _load_texture(path: String) -> Texture2D:
	if _texture_cache.has(path):
		return _texture_cache[path]

	if not ResourceLoader.exists(path):
		return null

	var tex: Texture2D = load(path)
	if tex:
		_texture_cache[path] = tex
	return tex


func _preload_features() -> void:
	var feature_types := [
		"forest_conifer",
		"forest_deciduous",
		"ice",
		"oasis",
		"river",
		"jungle"
	]
	for feat in feature_types:
		var path: String = TERRAIN_PATH + "feature_" + String(feat) + "_" + DEFAULT_DIRECTION + ".png"
		var tex := _load_texture(path)
		if tex:
			feature_textures[feat] = tex


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
