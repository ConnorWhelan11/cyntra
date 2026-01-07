extends RefCounted
class_name RulesPalette

## Maps rules catalog IDs to UI colors/icons with sane fallbacks.

const TerrainColors = preload("res://scripts/TerrainColors.gd")

var terrain_colors: Dictionary = {}
var resource_colors: Dictionary = {}
var improvement_colors: Dictionary = {}
var terrain_icons: Dictionary = {}
var resource_icons: Dictionary = {}
var improvement_icons: Dictionary = {}
var terrain_names: Dictionary = {}


func apply_rules_catalog(catalog: Dictionary) -> void:
	terrain_colors.clear()
	resource_colors.clear()
	improvement_colors.clear()
	terrain_icons.clear()
	resource_icons.clear()
	improvement_icons.clear()
	terrain_names.clear()

	var terrains = catalog.get("terrains", [])
	if typeof(terrains) == TYPE_ARRAY:
		for t in terrains:
			if typeof(t) != TYPE_DICTIONARY:
				continue
			var td: Dictionary = t
			var tid := _parse_runtime_id(td.get("id", -1))
			if tid < 0:
				continue
			var color = _parse_color(td.get("ui_color", null))
			if color != null:
				terrain_colors[tid] = color
			var icon_name := _normalize_label(td.get("ui_icon", null))
			if icon_name.is_empty():
				icon_name = _normalize_label(td.get("name", null))
			if not icon_name.is_empty():
				terrain_icons[tid] = icon_name
				terrain_names[tid] = icon_name

	var resources = catalog.get("resources", [])
	if typeof(resources) == TYPE_ARRAY:
		for r in resources:
			if typeof(r) != TYPE_DICTIONARY:
				continue
			var rd: Dictionary = r
			var rid := _parse_runtime_id(rd.get("id", -1))
			if rid < 0:
				continue
			var color = _parse_color(rd.get("ui_color", null))
			if color != null:
				resource_colors[rid] = color
			var icon = rd.get("ui_icon", null)
			if typeof(icon) == TYPE_STRING:
				resource_icons[rid] = String(icon)

	var improvements = catalog.get("improvements", [])
	if typeof(improvements) == TYPE_ARRAY:
		for i in improvements:
			if typeof(i) != TYPE_DICTIONARY:
				continue
			var idata: Dictionary = i
			var iid := _parse_runtime_id(idata.get("id", -1))
			if iid < 0:
				continue
			var color = _parse_color(idata.get("ui_color", null))
			if color != null:
				improvement_colors[iid] = color
			var icon = idata.get("ui_icon", null)
			if typeof(icon) == TYPE_STRING:
				improvement_icons[iid] = String(icon)


func terrain_color(terrain_id: int) -> Color:
	if terrain_colors.has(terrain_id):
		return terrain_colors[terrain_id]
	if terrain_names.has(terrain_id):
		return TerrainColors.get_terrain_color_by_name(String(terrain_names[terrain_id]))
	return TerrainColors.get_terrain_color(terrain_id)


func resource_color(resource_id: int) -> Color:
	if resource_colors.has(resource_id):
		return resource_colors[resource_id]
	return TerrainColors.get_resource_color(resource_id)


func improvement_color(improvement_id: int) -> Color:
	if improvement_colors.has(improvement_id):
		return improvement_colors[improvement_id]
	return Color(0.9, 0.9, 0.9, 0.9)


func terrain_icon(terrain_id: int) -> String:
	if terrain_icons.has(terrain_id):
		return String(terrain_icons[terrain_id])
	return ""


func resource_icon(resource_id: int) -> String:
	if resource_icons.has(resource_id):
		return String(resource_icons[resource_id])
	return ""


func improvement_icon(improvement_id: int) -> String:
	if improvement_icons.has(improvement_id):
		return String(improvement_icons[improvement_id])
	return ""


func _parse_runtime_id(value: Variant) -> int:
	if value == null:
		return -1
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
		if d.has("0"):
			return int(d.get("0", -1))
	return int(value)


func _normalize_label(value: Variant) -> String:
	if typeof(value) != TYPE_STRING:
		return ""
	var label := String(value).strip_edges().to_lower()
	return label.replace(" ", "_")


func _parse_color(value: Variant) -> Variant:
	if value == null:
		return null
	if typeof(value) == TYPE_COLOR:
		return value
	if typeof(value) == TYPE_ARRAY:
		var arr: Array = value
		if arr.size() < 3:
			return null
		var r = float(arr[0])
		var g = float(arr[1])
		var b = float(arr[2])
		var a = float(arr[3]) if arr.size() > 3 else 1.0
		return _normalize_color(r, g, b, a)
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		var r = float(d.get("r", 0))
		var g = float(d.get("g", 0))
		var b = float(d.get("b", 0))
		var a = float(d.get("a", 255))
		return _normalize_color(r, g, b, a)
	return null


func _normalize_color(r: float, g: float, b: float, a: float) -> Color:
	var scale := 1.0
	if max(r, g, b, a) > 1.0:
		scale = 255.0
	return Color(r / scale, g / scale, b / scale, a / scale)
