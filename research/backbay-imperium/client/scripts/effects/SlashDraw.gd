extends Node2D

## Melee slash effect drawing.

func _draw() -> void:
	# Arc slash
	var points := PackedVector2Array()
	for i in range(12):
		var t := float(i) / 11.0
		var angle: float = lerp(-0.8, 0.8, t)
		var radius := 25.0 + sin(t * PI) * 8.0
		points.append(Vector2.from_angle(angle) * radius)

	# Draw thick slash
	for i in range(points.size() - 1):
		var width = 4.0 * (1.0 - abs(float(i) / points.size() - 0.5) * 2.0) + 1.0
		draw_line(points[i], points[i + 1], Color(1.0, 1.0, 0.8, 0.9), width)

	# Inner bright line
	for i in range(points.size() - 1):
		draw_line(points[i] * 0.9, points[i + 1] * 0.9, Color(1.0, 1.0, 1.0, 0.7), 1.5)
