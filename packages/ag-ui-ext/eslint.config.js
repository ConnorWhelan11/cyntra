import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import storybook from "eslint-plugin-storybook";
import globals from "globals";

const r3fIgnoredProps = [
  // Geometry & mesh
  "args",
  "attach",
  "geometry",
  "material",
  "object",
  // Transform
  "position",
  "rotation",
  "scale",
  // Lighting
  "intensity",
  "color",
  "groundColor",
  "castShadow",
  "receiveShadow",
  // Material properties
  "opacity",
  "transparent",
  "toneMapped",
  "wireframe",
  "side",
  "metalness",
  "roughness",
  "emissive",
  "emissiveIntensity",
  "vertexColors",
  "depthWrite",
  "depthTest",
  "blending",
  "map",
  "normalMap",
  "envMapIntensity",
  // Line properties
  "linewidth",
  "lineWidth",
  "dashed",
  "dashScale",
  "dashSize",
  "gapSize",
  // Other R3F props
  "dispose",
  "frustumCulled",
  "renderOrder",
  "visible",
  "userData",
  "layers",
  "fog",
  "near",
  "far",
  "fov",
  "aspect",
  "zoom",
  // Points/particles
  "count",
  "itemSize",
  "stride",
  "array",
  "size",
  "sizeAttenuation",
  // Shadow properties
  "shadow-mapSize",
  "shadow-camera-far",
  "shadow-camera-left",
  "shadow-camera-right",
  "shadow-camera-top",
  "shadow-camera-bottom",
  "shadow-bias",
  // Light properties
  "distance",
  "decay",
  "angle",
  "penumbra",
  // Physical material properties
  "clearcoat",
  "clearcoatRoughness",
  "transmission",
  "thickness",
  "ior",
  // Transform
  "quaternion",
  // Shader material props
  "uniforms",
  "vertexShader",
  "fragmentShader",
];

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react: react,
      "react-hooks": reactHooks,
      storybook: storybook,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unknown-property": [
        "error",
        {
          ignore: r3fIgnoredProps,
        },
      ],
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  // Type definition files - relax rules
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  // Test files - relax rules
  {
    files: ["**/*.test.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["**/*.stories.@(js|jsx|ts|tsx)"],
    rules: {
      "react-hooks/rules-of-hooks": "off", // Storybook stories often violate this
    },
  },
  {
    files: ["**/*.stories.@(ts|tsx)"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "storybook-static/"],
  },
];
