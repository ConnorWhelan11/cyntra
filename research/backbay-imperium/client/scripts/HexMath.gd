extends RefCounted
class_name HexMath

static func axial_to_pixel(hex: Vector2i, origin: Vector2, size: float) -> Vector2:
	var x := size * sqrt(3.0) * (float(hex.x) + float(hex.y) * 0.5)
	var y := size * 1.5 * float(hex.y)
	return origin + Vector2(x, y)


static func pixel_to_axial(pos: Vector2, origin: Vector2, size: float) -> Vector2i:
	var p := pos - origin
	var qf := (sqrt(3.0) / 3.0 * p.x - 1.0 / 3.0 * p.y) / size
	var rf := (2.0 / 3.0 * p.y) / size
	return _axial_round(qf, rf)


static func hex_corners(center: Vector2, size: float) -> PackedVector2Array:
	var corners := PackedVector2Array()
	corners.resize(6)
	for i in range(6):
		var angle := deg_to_rad(60.0 * float(i) - 30.0)
		corners[i] = center + Vector2(size * cos(angle), size * sin(angle))
	return corners


static func _axial_round(qf: float, rf: float) -> Vector2i:
	var xf := qf
	var zf := rf
	var yf := -xf - zf

	var rx: float = round(xf)
	var ry: float = round(yf)
	var rz: float = round(zf)

	var x_diff: float = abs(rx - xf)
	var y_diff: float = abs(ry - yf)
	var z_diff: float = abs(rz - zf)

	if x_diff > y_diff and x_diff > z_diff:
		rx = -ry - rz
	elif y_diff > z_diff:
		ry = -rx - rz
	else:
		rz = -rx - ry

	return Vector2i(int(rx), int(rz))

