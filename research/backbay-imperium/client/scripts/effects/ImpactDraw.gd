extends Node2D

## Impact burst effect drawing.

func _draw() -> void:
	# Central burst
	draw_circle(Vector2.ZERO, 10, Color(1.0, 0.9, 0.5, 0.8))
	draw_circle(Vector2.ZERO, 6, Color(1.0, 1.0, 0.8, 1.0))

	# Radial lines
	for i in range(8):
		var angle := i * TAU / 8
		var inner := Vector2.from_angle(angle) * 8
		var outer := Vector2.from_angle(angle) * 18
		draw_line(inner, outer, Color(1.0, 0.8, 0.4, 0.7), 2.0)
