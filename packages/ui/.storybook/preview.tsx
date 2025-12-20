import type { Preview } from "@storybook/react-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import { ThemeProvider } from "next-themes";
import "../src/styles.css";
import { handlers } from "./mocks/handlers";

// Initialize MSW
initialize({ onUnhandledRequest: "bypass" });

const preview: Preview = {
  loaders: [mswLoader],

  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "centered",
    a11y: {
      context: "#storybook-root",
      manual: false,
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo"
    },
    backgrounds: {
      options: {
        dark: {
          name: "dark",
          value: "hsl(222 47% 7%)",
        },

        light: {
          name: "light",
          value: "hsl(0 0% 100%)",
        }
      }
    },
    msw: {
      handlers,
    },
  },

  decorators: [
    (Story, context) => (
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        forcedTheme={context?.globals?.theme as string}
        enableSystem={false}
        disableTransitionOnChange
      >
        <div className="min-h-screen bg-background text-foreground p-4">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],

  globalTypes: {
    theme: {
      description: "Global theme for components",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "dark", title: "Dark", icon: "moon" },
          { value: "light", title: "Light", icon: "sun" },
          { value: "meditative", title: "Meditative", icon: "heart" },
        ],
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: {
    backgrounds: {
      value: "dark"
    }
  }
};

export default preview;
