# gdlint:ignore = class-definitions-order
extends RefCounted
class_name TextureLoader

## Loads and caches terrain, resource, and feature sprites.
## Maps from runtime IDs to preloaded textures.

const TERRAIN_PATH := "res://assets/terrain/"
const RESOURCE_PATH := "res://assets/resources/"
const DEFAULT_DIRECTION := "north"

var terrain_textures: Dictionary = {}     # terrain_id -> Texture2D
var terrain_names: Dictionary = {}        # terrain_id -> String (e.g., "plains")
var resource_textures: Dictionary = {}    # resource_id -> Texture2D
var resource_names: Dictionary = {}       # resource_id -> String
var feature_textures: Dictionary = {}     # feature_name -> Texture2D

var _texture_cache: Dictionary = {}       # path -> Texture2D


func apply_rules_catalog(catalog: Dictionary) -> void:
	terrain_textures.clear()
	terrain_names.clear()
	resource_textures.clear()
	resource_names.clear()
	feature_textures.clear()

	var terrains = catalog.get("terrains", [])
	if typeof(terrains) == TYPE_ARRAY:
		for t in terrains:
			if typeof(t) != TYPE_DICTIONARY:
				continue
			var td: Dictionary = t
			var tid := _parse_runtime_id(td.get("id", -1))
			if tid < 0:
				continue

			var icon = td.get("ui_icon", null)
			if typeof(icon) == TYPE_STRING:
				var icon_name := String(icon).strip_edges().to_lower()
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


func _load_terrain_texture(name: String, direction: String) -> Texture2D:
	var path := TERRAIN_PATH + "terrain_" + name + "_" + direction + ".png"
	return _load_texture(path)


func _load_resource_texture(name: String) -> Texture2D:
	var path := RESOURCE_PATH + "resource_" + name + ".png"
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
