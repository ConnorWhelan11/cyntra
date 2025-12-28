extends Node2D

## Death particle drawing.

func _draw() -> void:
	var col: Color = get_meta("color", Color(0.8, 0.3, 0.2))
	draw_circle(Vector2.ZERO, 4, col)
	draw_circle(Vector2.ZERO, 2, col.lightened(0.4))
