shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform float blur_strength = 1.4;
uniform float vignette_strength = 0.45;
uniform float vignette_power = 2.2;
uniform vec4 tint = vec4(0.06, 0.12, 0.18, 0.55);

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 pixel = SCREEN_PIXEL_SIZE * blur_strength;

	vec4 sum = texture(screen_tex, uv) * 0.4;
	sum += texture(screen_tex, uv + vec2(pixel.x, 0.0)) * 0.15;
	sum += texture(screen_tex, uv - vec2(pixel.x, 0.0)) * 0.15;
	sum += texture(screen_tex, uv + vec2(0.0, pixel.y)) * 0.15;
	sum += texture(screen_tex, uv - vec2(0.0, pixel.y)) * 0.15;

	vec2 centered = uv * 2.0 - 1.0;
	float vig = pow(clamp(1.0 - dot(centered, centered), 0.0, 1.0), vignette_power);
	float vignette = mix(1.0 - vignette_strength, 1.0, vig);

	vec4 tinted = mix(sum, tint, tint.a);
	COLOR = tinted * vignette;
}
