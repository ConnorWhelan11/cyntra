export default function (plop) {
  plop.setGenerator("component", {
    description: "Create a new UI component with story and tests",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Component name (PascalCase):",
        validate: (input) => {
          if (!input) return "Component name is required";
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(input))
            return "Component name must be PascalCase";
          return true;
        },
      },
      {
        type: "list",
        name: "category",
        message: "Component category:",
        choices: ["atoms", "molecules", "organisms"],
        default: "atoms",
      },
      {
        type: "input",
        name: "description",
        message: "Component description:",
        default: "A reusable UI component",
      },
      {
        type: "confirm",
        name: "withForwardRef",
        message: "Use forwardRef?",
        default: false,
      },
      {
        type: "confirm",
        name: "withVariants",
        message: "Include class-variance-authority variants?",
        default: false,
      },
    ],
    actions: [
      {
        type: "add",
        path: "src/components/{{category}}/{{pascalCase name}}/{{pascalCase name}}.tsx",
        templateFile: "plop-templates/component.hbs",
      },
      {
        type: "add",
        path: "src/components/{{category}}/{{pascalCase name}}/{{pascalCase name}}.stories.tsx",
        templateFile: "plop-templates/story.hbs",
      },
      {
        type: "add",
        path: "src/components/{{category}}/{{pascalCase name}}/index.ts",
        templateFile: "plop-templates/index.hbs",
      },
      {
        type: "append",
        path: "src/components/{{category}}/index.ts",
        pattern: /$/,
        template: "export * from './{{pascalCase name}}'",
        skipIfExists: true,
      },
    ],
  });
}
