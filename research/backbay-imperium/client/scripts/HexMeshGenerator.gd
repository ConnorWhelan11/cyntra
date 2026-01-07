# gdlint:ignore = class-definitions-order
extends RefCounted
class_name HexMeshGenerator

## Generates 3D hex mesh geometry for terrain rendering.
## Creates flat or beveled hex tiles with proper UVs for PBR materials.

const HEX_SIZE := 1.0  # World units (matches Unit3DManager)


static func create_hex_mesh(bevel_height: float = 0.0, bevel_inset: float = 0.1) -> ArrayMesh:
	"""Create a single hex tile mesh with optional beveled edges."""
	var surface_tool := SurfaceTool.new()
	surface_tool.begin(Mesh.PRIMITIVE_TRIANGLES)

	# Calculate hex corner positions (flat-top orientation)
	var corners: Array[Vector3] = []
	var inner_corners: Array[Vector3] = []  # For bevel
	var uvs: Array[Vector2] = []
	var inner_uvs: Array[Vector2] = []

	for i in range(6):
		var angle := PI / 3.0 * i + PI / 6.0  # Flat-top hex
		var x := HEX_SIZE * cos(angle)
		var z := HEX_SIZE * sin(angle)
		corners.append(Vector3(x, bevel_height, z))

		# Inner corners for bevel
		var inner_x := (HEX_SIZE - bevel_inset) * cos(angle)
		var inner_z := (HEX_SIZE - bevel_inset) * sin(angle)
		inner_corners.append(Vector3(inner_x, bevel_height, inner_z))

		# UVs - map hex to 0-1 range
		var u := 0.5 + x / (HEX_SIZE * 2.0)
		var v := 0.5 + z / (HEX_SIZE * 2.0)
		uvs.append(Vector2(u, v))

		var inner_u := 0.5 + inner_x / (HEX_SIZE * 2.0)
		var inner_v := 0.5 + inner_z / (HEX_SIZE * 2.0)
		inner_uvs.append(Vector2(inner_u, inner_v))

	# Center point for top face
	var center := Vector3(0, bevel_height, 0)
	var center_uv := Vector2(0.5, 0.5)

	# Top face - 6 triangles from center
	var normal_up := Vector3.UP
	for i in range(6):
		var next := (i + 1) % 6

		surface_tool.set_normal(normal_up)
		surface_tool.set_uv(center_uv)
		surface_tool.add_vertex(center)

		surface_tool.set_normal(normal_up)
		surface_tool.set_uv(uvs[i])
		surface_tool.add_vertex(corners[i])

		surface_tool.set_normal(normal_up)
		surface_tool.set_uv(uvs[next])
		surface_tool.add_vertex(corners[next])

	# Bevel sides (if height > 0)
	if bevel_height > 0.01:
		for i in range(6):
			var next := (i + 1) % 6

			# Bottom corners (at y=0)
			var bottom_a := Vector3(corners[i].x, 0, corners[i].z)
			var bottom_b := Vector3(corners[next].x, 0, corners[next].z)

			# Calculate face normal
			var edge := bottom_b - bottom_a
			var to_center := -corners[i]
			var face_normal := edge.cross(Vector3.UP).normalized()
			if face_normal.dot(to_center) > 0:
				face_normal = -face_normal

			# Two triangles for each bevel face
			# Triangle 1: top-a, bottom-a, bottom-b
			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(uvs[i])
			surface_tool.add_vertex(corners[i])

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(Vector2(uvs[i].x, 1.0))
			surface_tool.add_vertex(bottom_a)

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(Vector2(uvs[next].x, 1.0))
			surface_tool.add_vertex(bottom_b)

			# Triangle 2: top-a, bottom-b, top-b
			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(uvs[i])
			surface_tool.add_vertex(corners[i])

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(Vector2(uvs[next].x, 1.0))
			surface_tool.add_vertex(bottom_b)

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(uvs[next])
			surface_tool.add_vertex(corners[next])

	surface_tool.generate_tangents()
	return surface_tool.commit()


static func create_hex_mesh_with_height(height: float, base_height: float = 0.0) -> ArrayMesh:
	"""Create a hex mesh at a specific height (for hills/mountains)."""
	var surface_tool := SurfaceTool.new()
	surface_tool.begin(Mesh.PRIMITIVE_TRIANGLES)

	var corners: Array[Vector3] = []
	var uvs: Array[Vector2] = []

	for i in range(6):
		var angle := PI / 3.0 * i + PI / 6.0
		var x := HEX_SIZE * cos(angle)
		var z := HEX_SIZE * sin(angle)
		corners.append(Vector3(x, base_height + height, z))

		var u := 0.5 + x / (HEX_SIZE * 2.0)
		var v := 0.5 + z / (HEX_SIZE * 2.0)
		uvs.append(Vector2(u, v))

	var center := Vector3(0, base_height + height, 0)
	var center_uv := Vector2(0.5, 0.5)
	var normal_up := Vector3.UP

	# Top face
	for i in range(6):
		var next := (i + 1) % 6

		surface_tool.set_normal(normal_up)
		surface_tool.set_uv(center_uv)
		surface_tool.add_vertex(center)

		surface_tool.set_normal(normal_up)
		surface_tool.set_uv(uvs[i])
		surface_tool.add_vertex(corners[i])

		surface_tool.set_normal(normal_up)
		surface_tool.set_uv(uvs[next])
		surface_tool.add_vertex(corners[next])

	# Side faces if elevated
	if height > 0.01:
		for i in range(6):
			var next := (i + 1) % 6
			var bottom_a := Vector3(corners[i].x, base_height, corners[i].z)
			var bottom_b := Vector3(corners[next].x, base_height, corners[next].z)

			var edge := bottom_b - bottom_a
			var face_normal := edge.cross(Vector3.UP).normalized()
			if face_normal.dot(-corners[i]) > 0:
				face_normal = -face_normal

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(uvs[i])
			surface_tool.add_vertex(corners[i])

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(Vector2(uvs[i].x, 1.0))
			surface_tool.add_vertex(bottom_a)

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(Vector2(uvs[next].x, 1.0))
			surface_tool.add_vertex(bottom_b)

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(uvs[i])
			surface_tool.add_vertex(corners[i])

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(Vector2(uvs[next].x, 1.0))
			surface_tool.add_vertex(bottom_b)

			surface_tool.set_normal(face_normal)
			surface_tool.set_uv(uvs[next])
			surface_tool.add_vertex(corners[next])

	surface_tool.generate_tangents()
	return surface_tool.commit()


static func axial_to_world(q: int, r: int) -> Vector3:
	"""Convert axial hex coordinates to 3D world position."""
	var x := HEX_SIZE * sqrt(3.0) * (float(q) + float(r) / 2.0)
	var z := HEX_SIZE * 1.5 * float(r)
	return Vector3(x, 0, z)


static func create_water_plane(width: int, height: int) -> ArrayMesh:
	"""Create a large water plane that covers the entire map."""
	var surface_tool := SurfaceTool.new()
	surface_tool.begin(Mesh.PRIMITIVE_TRIANGLES)

	# Calculate map bounds in world coordinates
	var min_pos := axial_to_world(0, 0)
	var max_pos := axial_to_world(width, height)

	# Add some padding
	var padding := HEX_SIZE * 3.0
	var x0 := min_pos.x - padding
	var x1 := max_pos.x + padding
	var z0 := min_pos.z - padding
	var z1 := max_pos.z + padding

	var water_y := -0.12  # Well below terrain for proper ocean depth

	# Simple quad
	var normal := Vector3.UP

	surface_tool.set_normal(normal)
	surface_tool.set_uv(Vector2(0, 0))
	surface_tool.add_vertex(Vector3(x0, water_y, z0))

	surface_tool.set_normal(normal)
	surface_tool.set_uv(Vector2(1, 0))
	surface_tool.add_vertex(Vector3(x1, water_y, z0))

	surface_tool.set_normal(normal)
	surface_tool.set_uv(Vector2(1, 1))
	surface_tool.add_vertex(Vector3(x1, water_y, z1))

	surface_tool.set_normal(normal)
	surface_tool.set_uv(Vector2(0, 0))
	surface_tool.add_vertex(Vector3(x0, water_y, z0))

	surface_tool.set_normal(normal)
	surface_tool.set_uv(Vector2(1, 1))
	surface_tool.add_vertex(Vector3(x1, water_y, z1))

	surface_tool.set_normal(normal)
	surface_tool.set_uv(Vector2(0, 1))
	surface_tool.add_vertex(Vector3(x0, water_y, z1))

	surface_tool.generate_tangents()
	return surface_tool.commit()
