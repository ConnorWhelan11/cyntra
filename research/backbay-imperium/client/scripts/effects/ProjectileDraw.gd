extends Node2D

## Generic projectile drawing.

func _draw() -> void:
	# Glowing orb projectile
	draw_circle(Vector2.ZERO, 6, Color(1.0, 0.8, 0.3, 0.9))
	draw_circle(Vector2.ZERO, 4, Color(1.0, 1.0, 0.6, 1.0))
	draw_circle(Vector2.ZERO, 2, Color(1.0, 1.0, 1.0, 1.0))

	# Trail
	draw_line(Vector2(-15, 0), Vector2(-5, 0), Color(1.0, 0.6, 0.2, 0.5), 3.0)
	draw_line(Vector2(-25, 0), Vector2(-15, 0), Color(1.0, 0.6, 0.2, 0.2), 2.0)
