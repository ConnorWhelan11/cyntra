shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

// Lake water colors - distinctly GREEN/TURQUOISE freshwater (very different from ocean blue)
uniform vec3 deep_color : source_color = vec3(0.02, 0.25, 0.20);      // Deep teal-green
uniform vec3 shallow_color : source_color = vec3(0.08, 0.45, 0.35);  // Bright turquoise
uniform vec3 shore_color : source_color = vec3(0.15, 0.55, 0.42);    // Emerald shore

// Gentle wave properties - calmer than ocean
uniform float wave_speed : hint_range(0.01, 0.1) = 0.025;
uniform float wave_scale : hint_range(1.0, 8.0) = 4.0;
uniform float wave_strength : hint_range(0.0, 0.15) = 0.04;

// Secondary wave (very subtle)
uniform float wave2_scale : hint_range(0.5, 4.0) = 2.0;
uniform float wave2_speed : hint_range(0.005, 0.05) = 0.012;
uniform float wave2_strength : hint_range(0.0, 0.1) = 0.025;

// Micro ripples (wind-driven)
uniform float ripple_scale : hint_range(8.0, 25.0) = 15.0;
uniform float ripple_speed : hint_range(0.03, 0.15) = 0.06;
uniform float ripple_strength : hint_range(0.0, 0.08) = 0.02;

// Very subtle vertex displacement
uniform float vertex_wave_height : hint_range(0.0, 0.05) = 0.008;

// Surface properties - more reflective than ocean
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float roughness : hint_range(0.0, 1.0) = 0.03;
uniform float specular : hint_range(0.0, 1.0) = 0.7;

// Fresnel (strong reflection at edges) - green-tinted for freshwater
uniform float fresnel_power : hint_range(1.0, 8.0) = 3.5;
uniform vec3 fresnel_color : source_color = vec3(0.55, 0.85, 0.75);  // Green-white reflection

// Transparency - slightly more transparent to show bottom
uniform float alpha : hint_range(0.6, 1.0) = 0.88;
uniform float bottom_visibility : hint_range(0.0, 0.3) = 0.15;

// Caustics effect (light patterns on lake bottom)
uniform float caustic_scale : hint_range(2.0, 15.0) = 8.0;
uniform float caustic_speed : hint_range(0.01, 0.1) = 0.03;
uniform float caustic_intensity : hint_range(0.0, 0.3) = 0.1;

// Normal map texture
uniform sampler2D normal_map : hint_normal, filter_linear_mipmap, repeat_enable;

varying vec3 world_pos;
varying float wave_height;

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

// Voronoi for caustics
float voronoi(vec2 p) {
	vec2 n = floor(p);
	vec2 f = fract(p);
	float md = 5.0;

	for(int i = -1; i <= 1; i++) {
		for(int j = -1; j <= 1; j++) {
			vec2 g = vec2(float(i), float(j));
			vec2 o = vec2(hash(n + g), hash(n + g + vec2(17.0, 31.0)));
			o = 0.5 + 0.5 * sin(TIME * caustic_speed + 6.2831 * o);
			vec2 r = g + o - f;
			float d = dot(r, r);
			md = min(md, d);
		}
	}
	return sqrt(md);
}

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;

	// Very gentle lake surface movement
	float time = TIME;

	// Simple sine waves for gentle bobbing
	float wave1 = sin(world_pos.x * 1.5 + time * 0.8) * cos(world_pos.z * 1.2 + time * 0.6);
	float wave2 = sin(world_pos.x * 0.8 - time * 0.5) * cos(world_pos.z * 0.9 + time * 0.7);

	float displacement = (wave1 * 0.6 + wave2 * 0.4) * vertex_wave_height;

	VERTEX.y += displacement;
	wave_height = displacement;
}

void fragment() {
	float time = TIME;
	vec2 uv = world_pos.xz;

	// === ANIMATED NORMAL MAPS (gentler than ocean) ===

	// Layer 1: Primary gentle waves
	vec2 wave1_uv = uv * wave_scale + vec2(time * wave_speed, time * wave_speed * 0.6);
	vec3 normal1 = texture(normal_map, wave1_uv).rgb * 2.0 - 1.0;
	normal1.xy *= wave_strength;

	// Layer 2: Secondary slow waves
	vec2 wave2_uv = uv * wave2_scale + vec2(-time * wave2_speed * 0.5, time * wave2_speed * 0.8);
	vec3 normal2 = texture(normal_map, wave2_uv).rgb * 2.0 - 1.0;
	normal2.xy *= wave2_strength;

	// Layer 3: Fine wind ripples
	vec2 ripple_uv = uv * ripple_scale + vec2(time * ripple_speed, -time * ripple_speed * 0.7);
	vec3 normal3 = texture(normal_map, ripple_uv).rgb * 2.0 - 1.0;
	normal3.xy *= ripple_strength;

	// Blend normals smoothly
	vec3 blended_normal = normalize(vec3(
		normal1.xy + normal2.xy + normal3.xy,
		normal1.z * normal2.z * normal3.z
	));

	NORMAL_MAP = blended_normal * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 1.0;

	// === FRESNEL EFFECT ===
	float fresnel = pow(1.0 - max(dot(NORMAL, VIEW), 0.0), fresnel_power);
	fresnel = clamp(fresnel, 0.0, 1.0);

	// === CAUSTICS (underwater light patterns) ===
	float caustics = voronoi(uv * caustic_scale);
	caustics = pow(caustics, 2.0) * caustic_intensity;
	// Animate caustics subtly
	caustics *= 0.7 + 0.3 * sin(time * 2.0);

	// === DEPTH-BASED COLORING ===
	// Natural color variation
	float depth_noise = noise(uv * 0.4) * 0.25 + 0.75;

	// Center of lake is deeper, edges are shallower
	float center_dist = length(uv - floor(uv + 0.5));
	float depth_factor = smoothstep(0.0, 0.5, center_dist);

	// Blend between deep and shallow colors
	vec3 water_color = mix(deep_color, shallow_color, depth_noise * 0.5);
	water_color = mix(water_color, shore_color, depth_factor * 0.3);

	// Add caustics to shallow areas
	water_color += vec3(caustics) * (1.0 - depth_factor * 0.5);

	// Add fresnel reflection
	water_color = mix(water_color, fresnel_color, fresnel * 0.55);

	// Subtle sparkle on wave peaks
	float sparkle = smoothstep(0.002, 0.008, wave_height) * 0.15;

	// === OUTPUT ===
	ALBEDO = water_color;
	METALLIC = metallic;
	ROUGHNESS = roughness - sparkle * 0.02;
	SPECULAR = specular + sparkle;
	ALPHA = alpha;

	// Brighter green glow in deeper areas - makes lakes stand out
	EMISSION = deep_color * 0.08 + vec3(caustics * 0.8) * vec3(0.3, 1.0, 0.7);
}
