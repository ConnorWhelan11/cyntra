shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

// Water colors for shallow/coastal water
uniform vec3 shallow_color : source_color = vec3(0.15, 0.45, 0.5);
uniform vec3 sand_tint : source_color = vec3(0.7, 0.6, 0.4);
uniform vec3 foam_color : source_color = vec3(0.95, 0.97, 1.0);

// Wave properties - gentler for shallow water
uniform float wave_speed : hint_range(0.01, 0.15) = 0.03;
uniform float wave_scale : hint_range(1.0, 8.0) = 4.0;
uniform float wave_strength : hint_range(0.0, 0.2) = 0.05;

// Ripple detail
uniform float ripple_scale : hint_range(5.0, 25.0) = 10.0;
uniform float ripple_speed : hint_range(0.02, 0.2) = 0.06;
uniform float ripple_strength : hint_range(0.0, 0.1) = 0.025;

// Shore foam
uniform float foam_amount : hint_range(0.0, 1.0) = 0.4;
uniform float foam_scale : hint_range(2.0, 15.0) = 6.0;
uniform float foam_speed : hint_range(0.01, 0.1) = 0.02;
uniform float foam_sharpness : hint_range(1.0, 10.0) = 3.0;

// Surface properties
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float roughness : hint_range(0.0, 1.0) = 0.15;
uniform float specular : hint_range(0.0, 1.0) = 0.4;

// Fresnel
uniform float fresnel_power : hint_range(1.0, 8.0) = 3.0;
uniform vec3 fresnel_color : source_color = vec3(0.7, 0.85, 0.9);

// Transparency - more transparent to show sand beneath
uniform float alpha : hint_range(0.3, 1.0) = 0.75;
uniform float sand_visibility : hint_range(0.0, 0.5) = 0.2;

// Textures
uniform sampler2D normal_map : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D foam_noise : filter_linear_mipmap, repeat_enable;
uniform sampler2D sand_texture : filter_linear_mipmap, repeat_enable;

varying vec3 world_pos;

// Noise functions
float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);

	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));

	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float value = 0.0;
	float amplitude = 0.5;
	for (int i = 0; i < 4; i++) {
		value += amplitude * noise(p);
		p *= 2.0;
		amplitude *= 0.5;
	}
	return value;
}

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;

	// Very subtle vertex movement for shallow water
	float time = TIME;
	float wave = sin(world_pos.x * 2.0 + time * 1.5) * cos(world_pos.z * 1.5 + time) * 0.008;
	VERTEX.y += wave;
}

void fragment() {
	float time = TIME;
	vec2 uv = world_pos.xz;

	// === ANIMATED WAVES (gentler than deep ocean) ===

	// Primary wave layer
	vec2 wave_uv = uv * wave_scale + vec2(time * wave_speed, time * wave_speed * 0.5);
	vec3 normal1 = texture(normal_map, wave_uv).rgb * 2.0 - 1.0;
	normal1.xy *= wave_strength;

	// Ripple detail layer
	vec2 ripple_uv = uv * ripple_scale + vec2(time * ripple_speed * 0.8, -time * ripple_speed * 1.2);
	vec3 normal2 = texture(normal_map, ripple_uv).rgb * 2.0 - 1.0;
	normal2.xy *= ripple_strength;

	// Blend normals
	vec3 blended_normal = normalize(vec3(
		normal1.xy + normal2.xy,
		sqrt(1.0 - clamp(dot(normal1.xy + normal2.xy, normal1.xy + normal2.xy), 0.0, 1.0))
	));

	NORMAL_MAP = blended_normal * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 1.0;

	// === SHORE FOAM ===
	// Animated foam using noise
	vec2 foam_uv1 = uv * foam_scale + vec2(time * foam_speed, time * foam_speed * 0.7);
	vec2 foam_uv2 = uv * foam_scale * 0.7 + vec2(-time * foam_speed * 0.5, time * foam_speed * 0.3);

	float foam1 = fbm(foam_uv1 * 2.0);
	float foam2 = fbm(foam_uv2 * 1.5);

	// Combine foam layers with animation
	float foam_wave = sin(time * 2.0 + uv.x * 3.0) * 0.5 + 0.5;
	float foam = (foam1 + foam2) * 0.5;
	foam = pow(foam, foam_sharpness) * foam_amount;

	// Pulsing foam intensity
	foam *= 0.7 + foam_wave * 0.3;

	// === FRESNEL ===
	float fresnel = pow(1.0 - max(dot(NORMAL, VIEW), 0.0), fresnel_power);
	fresnel = clamp(fresnel, 0.0, 1.0);

	// === COLOR MIXING ===
	// Base shallow water color
	vec3 water_color = shallow_color;

	// Mix in sand visibility (see-through effect)
	vec3 sand_col = texture(sand_texture, uv * 2.0).rgb * sand_tint;
	water_color = mix(water_color, sand_col, sand_visibility);

	// Add fresnel reflection
	water_color = mix(water_color, fresnel_color, fresnel * 0.4);

	// Add foam on top
	water_color = mix(water_color, foam_color, foam);

	// === OUTPUT ===
	ALBEDO = water_color;
	METALLIC = metallic;
	ROUGHNESS = mix(roughness, 0.6, foam); // Foam is rougher
	SPECULAR = specular * (1.0 - foam * 0.5); // Less specular on foam

	// Transparency - foam is more opaque
	ALPHA = mix(alpha, 0.95, foam);

	// Subtle foam emission for brightness
	EMISSION = foam_color * foam * 0.1;
}
