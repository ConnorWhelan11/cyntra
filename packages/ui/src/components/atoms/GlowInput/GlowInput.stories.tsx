import type { Meta, StoryObj } from "@storybook/react-vite";
import { Eye, EyeOff, Lock, Mail, Search, User } from "lucide-react";
import React from "react";
import { GlowInput } from "./GlowInput";

const meta: Meta<typeof GlowInput> = {
  title: "Atoms/GlowInput",
  component: GlowInput,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A futuristic input field with neon focus effects, comprehensive label/error handling, and icon support. Perfect for forms in cyberpunk-themed interfaces with full accessibility compliance.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "error", "success"],
      description: "Input visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "sm", "lg"],
      description: "Input size",
    },
    label: {
      control: { type: "text" },
      description: "Input label text",
    },
    description: {
      control: { type: "text" },
      description: "Helper description text",
    },
    error: {
      control: { type: "text" },
      description: "Error message (overrides description)",
    },
    placeholder: {
      control: { type: "text" },
      description: "Placeholder text",
    },
    disabled: {
      control: { type: "boolean" },
      description: "Disable input interaction",
    },
    disableAnimations: {
      control: { type: "boolean" },
      description: "Disable all animations",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Email Address",
    placeholder: "Enter your email",
    description: "We'll never share your email with anyone else",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-6 w-80">
      <GlowInput
        label="Default Input"
        placeholder="Default variant"
        description="This is a default input field"
      />
      <GlowInput
        label="Success Input"
        variant="success"
        placeholder="Success variant"
        description="This input shows success state"
        defaultValue="valid@example.com"
      />
      <GlowInput
        label="Error Input"
        variant="error"
        placeholder="Error variant"
        error="This field is required"
        defaultValue="invalid-email"
      />
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-6 w-80">
      <GlowInput
        label="Small Input"
        size="sm"
        placeholder="Small size"
        description="Compact input field"
      />
      <GlowInput
        label="Default Input"
        size="default"
        placeholder="Default size"
        description="Standard input field"
      />
      <GlowInput
        label="Large Input"
        size="lg"
        placeholder="Large size"
        description="Spacious input field"
      />
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-6 w-80">
      <GlowInput
        label="Search"
        placeholder="Search for anything..."
        leftIcon={<Search className="h-4 w-4" />}
        description="Use the search icon to find content"
      />
      <GlowInput
        label="Email"
        type="email"
        placeholder="your@email.com"
        leftIcon={<Mail className="h-4 w-4" />}
        description="Enter your email address"
      />
      <GlowInput
        label="Username"
        placeholder="johndoe"
        leftIcon={<User className="h-4 w-4" />}
        rightIcon={<Eye className="h-4 w-4" />}
        description="Choose a unique username"
      />
    </div>
  ),
};

export const PasswordField: Story = {
  render: () => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className="w-80">
        <GlowInput
          label="Password"
          type={showPassword ? "text" : "password"}
          placeholder="Enter your password"
          leftIcon={<Lock className="h-4 w-4" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          }
          description="Must be at least 8 characters long"
        />
      </div>
    );
  },
};

export const ErrorStates: Story = {
  render: () => (
    <div className="flex flex-col gap-6 w-80">
      <GlowInput
        label="Required Field"
        placeholder="This field is required"
        error="This field is required"
      />
      <GlowInput
        label="Email Validation"
        type="email"
        placeholder="Enter valid email"
        leftIcon={<Mail className="h-4 w-4" />}
        error="Please enter a valid email address"
        defaultValue="invalid-email"
      />
      <GlowInput
        label="Password Strength"
        type="password"
        placeholder="Enter strong password"
        leftIcon={<Lock className="h-4 w-4" />}
        error="Password must be at least 8 characters with uppercase, lowercase, and numbers"
        defaultValue="weak"
      />
    </div>
  ),
};

export const DisabledStates: Story = {
  render: () => (
    <div className="flex flex-col gap-6 w-80">
      <GlowInput
        label="Disabled Input"
        placeholder="This input is disabled"
        disabled
        description="This field cannot be edited"
      />
      <GlowInput
        label="Disabled with Value"
        defaultValue="Read-only content"
        disabled
        leftIcon={<User className="h-4 w-4" />}
        description="This field shows existing data"
      />
      <GlowInput
        label="Disabled with Error"
        error="This field has an error but is disabled"
        disabled
        defaultValue="Error state"
      />
    </div>
  ),
};

export const ReducedMotion: Story = {
  args: {
    label: "Reduced Motion Input",
    placeholder: "No animations",
    description: "This input respects prefers-reduced-motion",
    disableAnimations: true,
    leftIcon: <Search className="h-4 w-4" />,
  },
};

export const Interactive: Story = {
  args: {
    label: "Interactive Input",
    placeholder: "Type something...",
    description: "This input demonstrates focus and typing behavior",
    leftIcon: <Search className="h-4 w-4" />,
  },
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector("input");
    if (!input) {
      throw new Error("Input not found");
    }

    // Check input is rendered with proper attributes
    if (!input.placeholder.includes("Type something")) {
      throw new Error("Input placeholder not set correctly");
    }

    // Check label association
    const label = canvasElement.querySelector("label");
    if (!label || label.getAttribute("for") !== input.id) {
      throw new Error("Label not properly associated with input");
    }

    // Check description is linked
    const description = canvasElement.querySelector(`#${input.id}-description`);
    if (!description) {
      throw new Error("Description not properly linked");
    }
  },
};

export const FormExample: Story = {
  render: () => (
    <div className="w-80 space-y-6 p-6 border border-border/40 rounded-lg bg-card/40 backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-foreground">Sign In</h3>

      <GlowInput
        label="Email"
        type="email"
        placeholder="your@email.com"
        leftIcon={<Mail className="h-4 w-4" />}
        description="Enter your registered email address"
      />

      <GlowInput
        label="Password"
        type="password"
        placeholder="Enter your password"
        leftIcon={<Lock className="h-4 w-4" />}
        rightIcon={<Eye className="h-4 w-4" />}
        description="Must be at least 8 characters"
      />

      <div className="flex gap-3 pt-2">
        <button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 rounded-md font-medium transition-colors">
          Sign In
        </button>
        <button className="flex-1 border border-border hover:bg-accent hover:text-accent-foreground h-10 px-4 rounded-md font-medium transition-colors">
          Cancel
        </button>
      </div>
    </div>
  ),
};

export const LongContent: Story = {
  args: {
    label: "Very Long Label That Should Wrap Properly When It Gets Too Long",
    placeholder:
      "Very long placeholder text that demonstrates how the input handles extensive content",
    description:
      "This is a very long description that explains the purpose of this input field and provides detailed instructions for the user on how to properly fill it out",
    className: "max-w-xs",
  },
};
