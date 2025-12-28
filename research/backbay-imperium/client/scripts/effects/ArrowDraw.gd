extends Node2D

## Simple arrow projectile drawing.

func _draw() -> void:
	# Arrow shaft
	draw_line(Vector2(-12, 0), Vector2(8, 0), Color(0.6, 0.4, 0.2), 2.0)
	# Arrow head
	var head_points := PackedVector2Array([
		Vector2(12, 0),
		Vector2(6, -4),
		Vector2(6, 4)
	])
	draw_colored_polygon(head_points, Color(0.5, 0.5, 0.55))
	# Fletching
	draw_line(Vector2(-10, 0), Vector2(-14, -4), Color(0.8, 0.2, 0.2), 1.5)
	draw_line(Vector2(-10, 0), Vector2(-14, 4), Color(0.8, 0.2, 0.2), 1.5)
