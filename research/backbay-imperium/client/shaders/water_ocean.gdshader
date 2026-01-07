shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

// Water colors
uniform vec3 deep_color : source_color = vec3(0.02, 0.08, 0.18);
uniform vec3 shallow_color : source_color = vec3(0.1, 0.35, 0.45);
uniform vec3 foam_color : source_color = vec3(0.9, 0.95, 1.0);

// Wave properties - SMALLER values for realistic waves at this scale
uniform float wave_speed : hint_range(0.01, 0.2) = 0.04;
uniform float wave_scale : hint_range(0.5, 10.0) = 3.0;
uniform float wave_strength : hint_range(0.0, 0.3) = 0.08;

// Secondary wave layer (larger, slower)
uniform float wave2_scale : hint_range(0.2, 5.0) = 1.2;
uniform float wave2_speed : hint_range(0.005, 0.1) = 0.015;
uniform float wave2_strength : hint_range(0.0, 0.2) = 0.04;

// Micro detail waves (small ripples)
uniform float ripple_scale : hint_range(5.0, 30.0) = 12.0;
uniform float ripple_speed : hint_range(0.02, 0.3) = 0.08;
uniform float ripple_strength : hint_range(0.0, 0.15) = 0.03;

// Vertex displacement (subtle bobbing)
uniform float vertex_wave_height : hint_range(0.0, 0.1) = 0.015;
uniform float vertex_wave_freq : hint_range(0.5, 5.0) = 1.5;

// Surface properties
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float roughness : hint_range(0.0, 1.0) = 0.05;
uniform float specular : hint_range(0.0, 1.0) = 0.6;

// Fresnel (edge reflection)
uniform float fresnel_power : hint_range(1.0, 10.0) = 4.0;
uniform vec3 fresnel_color : source_color = vec3(0.6, 0.75, 0.85);

// Transparency
uniform float alpha : hint_range(0.5, 1.0) = 0.92;
uniform float depth_fade_distance : hint_range(0.1, 5.0) = 1.5;

// Normal map texture (tileable water normals)
uniform sampler2D normal_map : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D normal_map2 : hint_normal, filter_linear_mipmap, repeat_enable;

// Noise for variation
uniform sampler2D noise_texture : filter_linear_mipmap, repeat_enable;

varying vec3 world_pos;
varying float wave_height;

// Simplex-style noise function for wave variation
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

// Gerstner wave function for realistic ocean waves
vec3 gerstner_wave(vec2 pos, float time, vec2 direction, float steepness, float wavelength) {
	float k = 2.0 * PI / wavelength;
	float c = sqrt(9.8 / k);
	vec2 d = normalize(direction);
	float f = k * (dot(d, pos) - c * time);
	float a = steepness / k;

	return vec3(
		d.x * (a * cos(f)),
		a * sin(f),
		d.y * (a * cos(f))
	);
}

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;

	// Subtle vertex displacement for gentle ocean swell
	float time = TIME;

	// Multiple overlapping waves for natural motion
	vec3 wave1 = gerstner_wave(world_pos.xz, time, vec2(1.0, 0.3), vertex_wave_height * 0.5, 8.0);
	vec3 wave2 = gerstner_wave(world_pos.xz, time * 0.8, vec2(-0.5, 1.0), vertex_wave_height * 0.3, 12.0);
	vec3 wave3 = gerstner_wave(world_pos.xz, time * 1.2, vec2(0.7, -0.7), vertex_wave_height * 0.2, 5.0);

	vec3 displacement = wave1 + wave2 + wave3;

	// Apply displacement
	VERTEX.y += displacement.y;
	VERTEX.x += displacement.x * 0.3;
	VERTEX.z += displacement.z * 0.3;

	wave_height = displacement.y;
}

void fragment() {
	float time = TIME;
	vec2 uv = world_pos.xz;

	// === ANIMATED NORMAL MAPS ===

	// Layer 1: Primary waves (medium scale, main movement)
	vec2 wave1_uv = uv * wave_scale + vec2(time * wave_speed, time * wave_speed * 0.7);
	vec3 normal1 = texture(normal_map, wave1_uv).rgb * 2.0 - 1.0;
	normal1.xy *= wave_strength;

	// Layer 2: Secondary waves (larger, slower, different direction)
	vec2 wave2_uv = uv * wave2_scale + vec2(-time * wave2_speed * 0.6, time * wave2_speed);
	vec3 normal2 = texture(normal_map, wave2_uv).rgb * 2.0 - 1.0;
	normal2.xy *= wave2_strength;

	// Layer 3: Micro ripples (small, fast, adds detail)
	vec2 ripple_uv = uv * ripple_scale + vec2(time * ripple_speed * 1.3, -time * ripple_speed);
	vec3 normal3 = texture(normal_map2, ripple_uv).rgb * 2.0 - 1.0;
	normal3.xy *= ripple_strength;

	// Blend normals using Reoriented Normal Mapping
	vec3 blended_normal = normalize(vec3(
		normal1.xy + normal2.xy + normal3.xy,
		normal1.z * normal2.z * normal3.z
	));

	// Convert to tangent space normal
	NORMAL_MAP = blended_normal * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 1.0;

	// === FRESNEL EFFECT ===
	float fresnel = pow(1.0 - max(dot(NORMAL, VIEW), 0.0), fresnel_power);
	fresnel = clamp(fresnel, 0.0, 1.0);

	// === DEPTH-BASED COLORING ===
	// Use noise for natural color variation (simulating depth variation)
	float depth_noise = noise(uv * 0.3) * 0.3 + 0.7;

	// Add subtle variation based on wave height
	float color_variation = wave_height * 5.0 + 0.5;
	color_variation = clamp(color_variation, 0.0, 1.0);

	// Blend between deep and shallow colors
	vec3 water_color = mix(deep_color, shallow_color, depth_noise * 0.4 + color_variation * 0.2);

	// Add fresnel reflection color
	water_color = mix(water_color, fresnel_color, fresnel * 0.5);

	// === SPECULAR HIGHLIGHTS ===
	// Increase specular on wave peaks for sun glints
	float peak_highlight = smoothstep(0.0, 0.02, wave_height) * 0.3;

	// === OUTPUT ===
	ALBEDO = water_color;
	METALLIC = metallic;
	ROUGHNESS = roughness - peak_highlight; // Shinier on peaks
	SPECULAR = specular + peak_highlight;
	ALPHA = alpha;

	// Subtle emission for a slight glow in darker areas
	EMISSION = deep_color * 0.02;
}
