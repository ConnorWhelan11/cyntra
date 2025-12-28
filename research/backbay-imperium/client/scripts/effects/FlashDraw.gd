extends Node2D

## Flash effect drawing.

func _draw() -> void:
	var col: Color = get_meta("color", Color.WHITE)

	# Outer glow
	draw_circle(Vector2.ZERO, 20, Color(col.r, col.g, col.b, 0.3))
	draw_circle(Vector2.ZERO, 14, Color(col.r, col.g, col.b, 0.5))
	draw_circle(Vector2.ZERO, 8, Color(col.r, col.g, col.b, 0.8))
	draw_circle(Vector2.ZERO, 4, col)
