extends Node2D
class_name CombatEffects

## Combat visual effects manager.
## Handles attack animations, damage numbers, and death effects.

const DAMAGE_NUMBER_DURATION := 1.2
const DAMAGE_NUMBER_RISE := 40.0
const ATTACK_PROJECTILE_SPEED := 300.0
const DEATH_FADE_DURATION := 0.5

# Active effects
var active_effects: Array[Node] = []


func _process(_delta: float) -> void:
	# Clean up finished effects
	var i := 0
	while i < active_effects.size():
		if not is_instance_valid(active_effects[i]) or active_effects[i].is_queued_for_deletion():
			active_effects.remove_at(i)
		else:
			i += 1


## Show a damage number floating up from a position.
func show_damage_number(pos: Vector2, damage: int, is_critical: bool = false, is_heal: bool = false) -> void:
	var label := Label.new()
	label.position = pos - Vector2(20, 0)
	label.text = str(damage) if not is_heal else "+" + str(damage)
	label.z_index = 100

	# Styling
	var font_size := 18 if not is_critical else 24
	label.add_theme_font_size_override("font_size", font_size)

	var color: Color
	if is_heal:
		color = Color(0.3, 1.0, 0.4)
	elif is_critical:
		color = Color(1.0, 0.8, 0.2)
	else:
		color = Color(1.0, 0.3, 0.2)
	label.add_theme_color_override("font_color", color)

	# Shadow for readability
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)

	add_child(label)
	active_effects.append(label)

	# Animate
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "position:y", pos.y - DAMAGE_NUMBER_RISE, DAMAGE_NUMBER_DURATION)
	tween.tween_property(label, "modulate:a", 0.0, DAMAGE_NUMBER_DURATION).set_delay(DAMAGE_NUMBER_DURATION * 0.5)
	tween.chain().tween_callback(label.queue_free)


## Show an attack projectile flying from attacker to target.
func show_attack_projectile(from_pos: Vector2, to_pos: Vector2, attack_type: String = "melee") -> void:
	var projectile: Node2D

	match attack_type:
		"arrow":
			projectile = _create_arrow_projectile()
		"melee":
			_create_melee_effect(from_pos, to_pos)
			return  # Melee is immediate, no travel
		_:
			projectile = _create_default_projectile()

	projectile.position = from_pos
	projectile.z_index = 99

	# Rotate to face target
	var direction := (to_pos - from_pos).normalized()
	projectile.rotation = direction.angle()

	add_child(projectile)
	active_effects.append(projectile)

	# Animate travel
	var distance := from_pos.distance_to(to_pos)
	var duration := distance / ATTACK_PROJECTILE_SPEED

	var tween := create_tween()
	tween.tween_property(projectile, "position", to_pos, duration)
	tween.tween_callback(func():
		_show_impact_effect(to_pos)
		projectile.queue_free()
	)


## Show melee attack slash effect.
func _create_melee_effect(from_pos: Vector2, to_pos: Vector2) -> void:
	var slash := Node2D.new()
	slash.position = (from_pos + to_pos) * 0.5
	slash.z_index = 99
	if SlashDrawScript != null:
		slash.set_script(SlashDrawScript)

	# Draw a simple slash arc
	var direction := (to_pos - from_pos).normalized()
	slash.rotation = direction.angle()

	add_child(slash)
	active_effects.append(slash)

	# Simple flash effect using modulate
	var tween := create_tween()
	slash.modulate = Color(1.0, 1.0, 0.8, 1.0)
	tween.tween_property(slash, "modulate:a", 0.0, 0.3)
	tween.tween_callback(slash.queue_free)

	# Also show impact at target
	await get_tree().create_timer(0.1).timeout
	_show_impact_effect(to_pos)


func _create_arrow_projectile() -> Node2D:
	var arrow := Node2D.new()
	arrow.set_script(ArrowDrawScript)
	return arrow


func _create_default_projectile() -> Node2D:
	var proj := Node2D.new()
	proj.set_script(ProjectileDrawScript)
	return proj


func _show_impact_effect(pos: Vector2) -> void:
	var impact := Node2D.new()
	impact.position = pos
	impact.z_index = 98
	impact.set_script(ImpactDrawScript)

	add_child(impact)
	active_effects.append(impact)

	var tween := create_tween()
	impact.modulate = Color(1.0, 0.8, 0.3, 1.0)
	tween.tween_property(impact, "scale", Vector2(1.5, 1.5), 0.2)
	tween.parallel().tween_property(impact, "modulate:a", 0.0, 0.3)
	tween.tween_callback(impact.queue_free)


## Show unit death effect.
func show_death_effect(pos: Vector2, unit_color: Color) -> void:
	# Create explosion particles
	for i in range(8):
		var particle := Node2D.new()
		particle.position = pos
		particle.z_index = 97
		particle.set_script(ParticleDrawScript)
		particle.set_meta("color", unit_color.lightened(0.3))

		add_child(particle)
		active_effects.append(particle)

		# Random direction
		var angle := (i * TAU / 8) + randf_range(-0.3, 0.3)
		var velocity := Vector2.from_angle(angle) * randf_range(40, 80)
		var target_pos := pos + velocity

		var tween := create_tween()
		tween.set_parallel(true)
		tween.tween_property(particle, "position", target_pos, DEATH_FADE_DURATION)
		tween.tween_property(particle, "modulate:a", 0.0, DEATH_FADE_DURATION)
		tween.tween_property(particle, "scale", Vector2(0.3, 0.3), DEATH_FADE_DURATION)
		tween.chain().tween_callback(particle.queue_free)

	# Flash at death position
	var flash := Node2D.new()
	flash.position = pos
	flash.z_index = 98
	flash.set_script(FlashDrawScript)
	flash.set_meta("color", Color.WHITE)

	add_child(flash)
	active_effects.append(flash)

	var tween := create_tween()
	tween.tween_property(flash, "scale", Vector2(2.0, 2.0), 0.15)
	tween.parallel().tween_property(flash, "modulate:a", 0.0, 0.2)
	tween.tween_callback(flash.queue_free)


## Show combat result summary.
func show_combat_result(attacker_pos: Vector2, defender_pos: Vector2,
		attacker_damage: int, defender_damage: int,
		attacker_died: bool, defender_died: bool,
		attacker_color: Color, defender_color: Color) -> void:

	# Show attack projectile/effect
	show_attack_projectile(attacker_pos, defender_pos, "melee")

	# Delay for damage numbers
	await get_tree().create_timer(0.15).timeout

	# Show damage to defender
	if defender_damage > 0:
		show_damage_number(defender_pos + Vector2(0, -20), defender_damage)

	# Show counter-attack damage to attacker
	if attacker_damage > 0:
		await get_tree().create_timer(0.3).timeout
		show_damage_number(attacker_pos + Vector2(0, -20), attacker_damage)

	# Death effects
	if defender_died:
		await get_tree().create_timer(0.2).timeout
		show_death_effect(defender_pos, defender_color)

	if attacker_died:
		await get_tree().create_timer(0.4).timeout
		show_death_effect(attacker_pos, attacker_color)


# -------------------------------------------------------------------------
# Draw scripts for effect nodes (loaded dynamically to avoid errors if missing)
# -------------------------------------------------------------------------

var ArrowDrawScript: GDScript = null
var ProjectileDrawScript: GDScript = null
var ImpactDrawScript: GDScript = null
var ParticleDrawScript: GDScript = null
var FlashDrawScript: GDScript = null
var SlashDrawScript: GDScript = null


func _ready() -> void:
	# Load effect scripts if available
	if ResourceLoader.exists("res://scripts/effects/ArrowDraw.gd"):
		ArrowDrawScript = load("res://scripts/effects/ArrowDraw.gd")
	if ResourceLoader.exists("res://scripts/effects/ProjectileDraw.gd"):
		ProjectileDrawScript = load("res://scripts/effects/ProjectileDraw.gd")
	if ResourceLoader.exists("res://scripts/effects/ImpactDraw.gd"):
		ImpactDrawScript = load("res://scripts/effects/ImpactDraw.gd")
	if ResourceLoader.exists("res://scripts/effects/ParticleDraw.gd"):
		ParticleDrawScript = load("res://scripts/effects/ParticleDraw.gd")
	if ResourceLoader.exists("res://scripts/effects/FlashDraw.gd"):
		FlashDrawScript = load("res://scripts/effects/FlashDraw.gd")
	if ResourceLoader.exists("res://scripts/effects/SlashDraw.gd"):
		SlashDrawScript = load("res://scripts/effects/SlashDraw.gd")
