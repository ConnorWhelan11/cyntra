# @oos/ui

A modern, futuristic UI component library built for the Segrada medical education platform. Features HUD-inspired design with neon accents, smooth animations, and comprehensive accessibility support.

## Features

- 🎨 **Futuristic Design System** - HUD-inspired components with neon glow effects
- 🌗 **Theme Support** - Dark (default), light, and meditative themes
- 📱 **Responsive** - Mobile-first design with Tailwind CSS
- ♿ **Accessible** - WCAG 2.1 compliant components
- 🧪 **Storybook** - Interactive component playground
- 🔄 **Animations** - Framer Motion with reduced motion support
- 📊 **Mock Data** - MSW integration for realistic demos
- 🛠️ **Developer Tools** - Plop generators for consistent scaffolding

## Getting Started

### Installation

```bash
yarn install
```

### Development

Start Storybook for component development:

```bash
yarn story
```

Build components for production:

```bash
yarn build
```

Generate new components:

```bash
yarn gen:cmp
```

### Scripts

- `yarn story` - Start Storybook development server
- `yarn build:story` - Build Storybook for production
- `yarn build` - Build component library
- `yarn dev` - Build components in watch mode
- `yarn gen:cmp` - Generate new component with Plop
- `yarn lint` - Run ESLint
- `yarn typecheck` - Run TypeScript checks
- `yarn test:ui` - Run Storybook tests

## Architecture

### Component Organization

```
src/
├── components/
│   ├── atoms/          # Basic building blocks
│   ├── molecules/      # Combinations of atoms
│   └── organisms/      # Complex UI sections
├── lib/
│   └── utils.ts        # Utility functions (cn, glow, hudGrad)
├── fixtures/           # Mock data for stories
└── styles.css          # Global styles and theme tokens
```

### Theme System

The design system uses CSS custom properties for theming:

- **Dark Theme** (default) - High contrast with neon accents
- **Light Theme** - Clean, professional appearance
- **Meditative Theme** - Reduced motion and softer colors

### Utility Functions

- `cn()` - Class name merging with Tailwind
- `glow()` - Generate neon glow effects
- `hudGrad()` - Create HUD-style conic gradients
- `animateNumber()` - Smooth number transitions
- `prefersReducedMotion()` - Accessibility helper

## Components

### Atoms

- **HUDProgressRing** - Animated circular progress indicator with neon themes

### Molecules

_(Coming soon)_

### Organisms

_(Coming soon)_

## Development Workflow

### Creating New Components

Use the Plop generator for consistent component creation:

```bash
yarn gen:cmp
```

This creates:

- Component file with TypeScript interfaces
- Storybook story with multiple variants
- Index file for clean exports
- Updates category index files

### Story Development

Each component should have comprehensive stories:

- Default state
- All variants/themes
- Interactive examples
- Accessibility tests
- Edge cases

### Mock Data

Use MSW handlers in `.storybook/mocks/` for realistic component demos:

```typescript
// In your story
export const WithData: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/progress", () => {
          return HttpResponse.json(mockProgress);
        }),
      ],
    },
  },
};
```

## Design Tokens

### Colors

- `--cyan-neon` - Primary accent color
- `--magenta-neon` - Secondary accent color
- `--emerald-neon` - Success/progress color
- `--glow` - General glow effect color

### Animations

- `animate-soft-glow` - Subtle pulsing glow
- `animate-hud-sweep` - Progress ring animation
- `animate-glitch` - Error state effect

### Shadows

- `shadow-neon-cyan` - Cyan glow shadow
- `shadow-neon-magenta` - Magenta glow shadow
- `shadow-neon-emerald` - Emerald glow shadow
- `shadow-glass` - Glassmorphism effect

## Contributing

1. Create components using the Plop generator
2. Write comprehensive Storybook stories
3. Ensure accessibility compliance
4. Add appropriate TypeScript types
5. Test with reduced motion preferences
6. Update documentation

## License

Private - Segrada Medical Education Platform
