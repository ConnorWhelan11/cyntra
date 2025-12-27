here’s a **battle-tested UI stack** that maps cleanly to your “neo-academic cyberpunk” brief and plays perfectly with Next.js (App Router).

# 🧱 Foundation (design-system + theming)

- **Tailwind CSS** for utility-first styling and speed. Official Next.js guide is rock solid. ([Tailwind CSS][1])
- **Radix Primitives** for accessible, unstyled building blocks (dialogs, popovers, sliders, etc.). You style them; they handle the a11y edge-cases. ([Radix UI][2])
- **shadcn/ui** to scaffold beautiful Tailwind + Radix components (buttons, cards, drawers, carousels, etc.) you own in your repo. Great for fast, cohesive theming. ([Shadcn UI][3])
- **next-themes** to drive dark mode + future theme variants (e.g., “Meditative Mode”). ([GitHub][4], [Shadcn UI][5])
- **lucide-react** for sharp, consistent icons with tiny imports. ([Lucide][6], [npm][7])

> Why this trio? Radix gives bulletproof UX primitives; shadcn/ui gives you polished, Tailwind-styled components on top; next-themes + lucide keep the visual language unified across modes.

# 🎞️ Motion, micro-interactions & “holographic” feel

- **Motion (formerly Framer Motion)** for page transitions, HUD fills, scroll-linked progress, and type/hover effects (variants + `useScroll` make your “energy bars” trivial). ([motion.dev][8])
- Optional: **Lottie**/**Rive** for lightweight vector animations (badge pops, agent avatar pulses).

# 🧪 3D, glows & sci-fi depth

- **@react-three/fiber** (React renderer for Three.js) to drop subtle 3D scene layers (neural meshes, molecular orbs, parallax grids). ([r3f.docs.pmnd.rs][9])
- **@react-three/drei** helpers (cameras, controls, `<Html/>` overlays). ([drei.docs.pmnd.rs][10])
- **@react-three/postprocessing** for bloom/outline/glow to nail the cyber-HUD vibe without custom shader hell. ([react-postprocessing.docs.pmnd.rs][11])

# 📈 Charts, dials & the “mission control” look

- **Tremor** (Tailwind-styled dashboard components, built on Radix) for quick KPI cards and charts that match your design tokens. ([tremor.so][12], [Tremor NPM][13])
- **Nivo** for the **radar chart** (knowledge radar: Phys/Chem/Bio/Psych) with nice theming hooks. ([nivo.rocks][14])
- **Apache ECharts** when you want maximal control + animated neon themes (also has a great radar). ([echarts.apache.org][15])

# 🧭 Command surfaces, drawers & toasts (agent UX)

- **cmdk** for a global **Command-K** palette (search, jump to “quests”, open Tutor). ([GitHub][16], [cmdk.paco.me][17])
- **Vaul** for silky mobile/desktop drawers (mission sheets, explanations), inspired by Radix patterns. ([Emil Kowalski][18])
- **Sonner** for tasteful toasts (XP gains, streak alerts, “agent online”). ([Shadcn UI][19], [GitHub][20])

# 📅 Timeline, calendar & carousels (Study Plan UI)

- **React Chrono** to render your **scrollable timeline with glowing nodes** (vertical/horizontal modes). ([Medium][21])
- **FullCalendar (React)** when you need a conventional calendar grid alongside the timeline. ([DEV Community][22])
- **Embla** (already wrapped by shadcn’s Carousel) for smooth, HUD-style carousels (practice sets, flashcards). ([embla-carousel.com][23], [Shadcn UI][24])

# 📋 Forms, tables & data fetching

- **react-hook-form + Zod** for snappy, typed forms (practice settings, profile, goals). ([react-hook-form.com][25], [Zod][26])
- **TanStack Table** (lightweight) or **AG Grid** (enterprisey) for analytics tables / result breakdowns. ([Lucide][6], [Phosphor Icons][27])

## 🗺️ How this maps to your screens

- **Landing Dashboard:** shadcn **Card**, **Tabs**, **Progress** + Motion for ring fill; Tremor for KPI tiles; cmdk for quick-open; Sonner for streak toasts. ([Shadcn UI][3], [motion.dev][8], [tremor.so][12])
- **Study Plan Timeline:** React Chrono + Embla for scrolling nodes with Motion `whileInView` reveals; Vaul drawer opens task detail. ([Medium][21], [embla-carousel.com][23], [Emil Kowalski][18])
- **Practice Sessions:** Radix **Dialog/Tooltip** + Motion for focus ring; Sonner for feedback; ECharts/Nivo for per-question mini-charts. ([Radix UI][2], [motion.dev][8], [nivo.rocks][14])
- **AI Tutor (Agent):** shadcn **Sheet/Drawer**/**Popover**, cmdk palette, Motion for typewriter/typing pulses; optional r3f orb + postprocessing glow. ([GitHub][16], [react-postprocessing.docs.pmnd.rs][11])
- **Progress Radar:** Nivo Radar (fast), or ECharts Radar (max control) with neon theme; Tremor for surrounding cards/legends. ([nivo.rocks][14], [echarts.apache.org][15], [tremor.so][12])

---

## 🧠 Notes & gotchas (2025-ready)

- **shadcn/ui + Radix + Tailwind** are fully compatible with the Next.js App Router. Follow the Next install steps and keep components in your repo for full control. ([Shadcn UI][28])
- **Motion (Framer Motion)** rebranded to **Motion**—APIs are the same but docs moved (use them for scroll-linked effects). ([motion.dev][8])
- **NextUI v2** switched to Tailwind to play nicer with RSC—use it if you want a styled kit alternative, but the shadcn+Radix route gives you tighter brand control. ([HeroUI (Previously NextUI)][29])
- **Mantine v7** dropped CSS-in-JS → easy in Next App Router; good alternative if you prefer a full component suite. ([medplum.com][30])

---

If you want, I can turn this into a **starter Next.js UI scaffold** (with the theme, HUD progress ring, a timeline prototype, and the Tutor drawer wired up) so you can see the vibe end-to-end.

[1]: https://tailwindcss.com/docs/guides/nextjs?utm_source=chatgpt.com "Install Tailwind CSS with Next.js"
[2]: https://www.radix-ui.com/primitives/docs/overview/introduction?utm_source=chatgpt.com "Introduction – Radix Primitives"
[3]: https://ui.shadcn.com/docs/installation?utm_source=chatgpt.com "Installation - Shadcn UI"
[4]: https://github.com/pacocoursey/next-themes?utm_source=chatgpt.com "pacocoursey/next-themes: Perfect Next.js dark mode in 2 ..."
[5]: https://ui.shadcn.com/docs/dark-mode/next?utm_source=chatgpt.com "Next.js - shadcn/ui"
[6]: https://lucide.dev/guide/packages/lucide-react?utm_source=chatgpt.com "Lucide React"
[7]: https://www.npmjs.com/package/lucide-react?utm_source=chatgpt.com "lucide-react"
[8]: https://motion.dev/docs?utm_source=chatgpt.com "Motion Documentation (prev Framer Motion)"
[9]: https://r3f.docs.pmnd.rs/getting-started/introduction?utm_source=chatgpt.com "React Three Fiber: Introduction"
[10]: https://drei.docs.pmnd.rs/?utm_source=chatgpt.com "Drei: Introduction"
[11]: https://react-postprocessing.docs.pmnd.rs/?utm_source=chatgpt.com "react-postprocessing docs - Poimandres"
[12]: https://tremor.so/?utm_source=chatgpt.com "Tremor – Copy-and-Paste Tailwind CSS UI Components for ..."
[13]: https://npm.tremor.so/docs/getting-started/installation?utm_source=chatgpt.com "Installation • Docs - Tremor NPM"
[14]: https://nivo.rocks/radar/?utm_source=chatgpt.com "Radar chart"
[15]: https://echarts.apache.org/examples/en/index.html?utm_source=chatgpt.com "Examples - Apache ECharts"
[16]: https://github.com/pacocoursey/cmdk?utm_source=chatgpt.com "pacocoursey/cmdk: Fast, unstyled command menu React ..."
[17]: https://cmdk.paco.me/?utm_source=chatgpt.com "Fast, composable, unstyled command menu for React — K"
[18]: https://vaul.emilkowal.ski/?utm_source=chatgpt.com "Vaul"
[19]: https://ui.shadcn.com/docs/components/sonner?utm_source=chatgpt.com "Sonner - Shadcn UI"
[20]: https://github.com/emilkowalski/sonner?utm_source=chatgpt.com "emilkowalski/sonner: An opinionated toast component for ..."
[21]: https://medium.com/frontendweb/how-to-build-timelines-in-react-using-react-chrono-13bc1ced470a?utm_source=chatgpt.com "How to Build Timelines in React Using React Chrono?"
[22]: https://dev.to/tsparticles/tsparticles-documentation-website-2ihe?utm_source=chatgpt.com "tsParticles Documentation Website"
[23]: https://www.embla-carousel.com/api/?utm_source=chatgpt.com "API"
[24]: https://ui.shadcn.com/docs/components/carousel?utm_source=chatgpt.com "Carousel - Shadcn UI"
[25]: https://www.react-hook-form.com/api/?utm_source=chatgpt.com "API Documentation"
[26]: https://zod.dev/?utm_source=chatgpt.com "Zod: Intro"
[27]: https://phosphoricons.com/?utm_source=chatgpt.com "Phosphor Icons"
[28]: https://ui.shadcn.com/docs/installation/next?utm_source=chatgpt.com "Next.js - Shadcn UI"
[29]: https://www.heroui.com/blog/nextui-v2?utm_source=chatgpt.com "Introducing NextUI Version 2.0"
[30]: https://www.medplum.com/docs/react/mantine-6x-to-7x?utm_source=chatgpt.com "Mantine 6.x to 7.x"
