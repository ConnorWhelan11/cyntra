import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { GlowButton } from "../../atoms/GlowButton";
import { TutorDrawer, type ChatMessage } from "./TutorDrawer";

// Mock data for stories
const mockMessages: ChatMessage[] = [
  {
    id: "1",
    type: "agent",
    content: "Hello! I'm your AI Study Tutor. How can I help you with your MCAT preparation today?",
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    agentName: "AI Tutor",
  },
  {
    id: "2",
    type: "user",
    content:
      "I'm struggling with organic chemistry mechanisms. Can you explain nucleophilic substitution?",
    timestamp: new Date(Date.now() - 4 * 60 * 1000),
  },
  {
    id: "3",
    type: "agent",
    content:
      "I'd be happy to help you with nucleophilic substitution! This is a fundamental reaction in organic chemistry. Let me break it down for you:",
    timestamp: new Date(Date.now() - 3 * 60 * 1000),
    agentName: "AI Tutor",
  },
  {
    id: "4",
    type: "agent",
    content:
      "There are two main types: SN1 and SN2 mechanisms. SN1 (Substitution Nucleophilic Unimolecular) involves two steps with a carbocation intermediate, while SN2 (Substitution Nucleophilic Bimolecular) occurs in one step with backside attack.",
    timestamp: new Date(Date.now() - 2 * 60 * 1000),
    agentName: "AI Tutor",
  },
  {
    id: "5",
    type: "user",
    content: "That makes sense! Can you give me some practice problems?",
    timestamp: new Date(Date.now() - 1 * 60 * 1000),
  },
];

const meta: Meta<typeof TutorDrawer> = {
  title: "Organisms/TutorDrawer",
  component: TutorDrawer,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A comprehensive AI tutor interface using Vaul for smooth drawer animations. Features chat transcript, real-time typing indicators, file upload, voice input, and integration with existing atoms and molecules.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "select" },
      options: ["default", "wide", "full"],
      description: "Drawer width size",
    },
    agentOnline: {
      control: { type: "boolean" },
      description: "Agent online status",
    },
    agentTyping: {
      control: { type: "boolean" },
      description: "Show typing indicator",
    },
    loading: {
      control: { type: "boolean" },
      description: "Loading state",
    },
    voiceEnabled: {
      control: { type: "boolean" },
      description: "Enable voice input",
    },
    fileUploadEnabled: {
      control: { type: "boolean" },
      description: "Enable file upload",
    },
    disableAnimations: {
      control: { type: "boolean" },
      description: "Disable all animations",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const TutorDrawerWithState = (args: Partial<ComponentProps<typeof TutorDrawer>>) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(mockMessages);
  const [inputValue, setInputValue] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendMessage = (content: string) => {
    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setAgentTyping(true);

    // Simulate AI response
    setTimeout(() => {
      setAgentTyping(false);
      setLoading(false);
      const agentMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "agent",
        content:
          "Thanks for your question! Let me think about that and provide you with a detailed explanation.",
        timestamp: new Date(),
        agentName: "AI Tutor",
      };
      setMessages((prev) => [...prev, agentMessage]);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-md mx-auto space-y-4">
        <h2 className="text-2xl font-bold text-foreground">AI Tutor Demo</h2>
        <p className="text-muted-foreground">
          Click the button below to open the AI tutor drawer and start a conversation.
        </p>

        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)} className="w-full">
          Open AI Tutor
        </GlowButton>
      </div>

      <TutorDrawer
        open={open}
        onOpenChange={setOpen}
        messages={messages}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSendMessage={handleSendMessage}
        agentTyping={agentTyping}
        loading={loading}
        voiceEnabled
        fileUploadEnabled
        {...args}
      />
    </div>
  );
};

export const Default: Story = {
  render: (args) => <TutorDrawerWithState {...args} />,
};

export const EmptyConversation: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSendMessage = (content: string) => {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "user",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);

      // Simulate first response
      setTimeout(() => {
        setLoading(false);
        const welcomeMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: "agent",
          content:
            "Hello! I'm excited to help you with your studies. What topic would you like to explore today?",
          timestamp: new Date(),
          agentName: "AI Tutor",
        };
        setMessages((prev) => [...prev, welcomeMessage]);
      }, 1000);
    };

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          Start New Conversation
        </GlowButton>

        <TutorDrawer
          open={open}
          onOpenChange={setOpen}
          messages={messages}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSendMessage={handleSendMessage}
          loading={loading}
          placeholder="What would you like to learn about?"
        />
      </div>
    );
  },
};

export const WithAttachments: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
      {
        id: "1",
        type: "agent",
        content:
          "I can help you analyze this study guide. Please upload the document and I'll review it for you.",
        timestamp: new Date(Date.now() - 2 * 60 * 1000),
        agentName: "AI Tutor",
      },
      {
        id: "2",
        type: "user",
        content: "Here's the study guide I mentioned:",
        timestamp: new Date(Date.now() - 1 * 60 * 1000),
        attachments: [
          {
            name: "MCAT_Biology_StudyGuide.pdf",
            type: "document",
            url: "#",
          },
          {
            name: "cell_diagram.png",
            type: "image",
            url: "#",
          },
        ],
      },
    ]);
    const [inputValue, setInputValue] = useState("");

    const handleSendMessage = (content: string) => {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "user",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
    };

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          View Conversation with Attachments
        </GlowButton>

        <TutorDrawer
          open={open}
          onOpenChange={setOpen}
          messages={messages}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSendMessage={handleSendMessage}
          fileUploadEnabled
        />
      </div>
    );
  },
};

export const WideLayout: Story = {
  render: () => <TutorDrawerWithState size="wide" />,
};

export const FullWidth: Story = {
  render: () => <TutorDrawerWithState size="full" />,
};

export const OfflineAgent: Story = {
  render: () => <TutorDrawerWithState agentOnline={false} />,
};

export const ReducedMotion: Story = {
  render: () => <TutorDrawerWithState disableAnimations={true} />,
};

export const Interactive: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>(mockMessages);
    const [inputValue, setInputValue] = useState("");

    const handleSendMessage = (content: string) => {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "user",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      // Simulate response
      setTimeout(() => {
        const agentMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: "agent",
          content: "That's a great question! Let me provide you with a comprehensive answer.",
          timestamp: new Date(),
          agentName: "AI Tutor",
        };
        setMessages((prev) => [...prev, agentMessage]);
      }, 500);
    };

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          Test Interactive Features
        </GlowButton>

        <TutorDrawer
          open={open}
          onOpenChange={setOpen}
          messages={messages}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSendMessage={handleSendMessage}
          voiceEnabled
          fileUploadEnabled
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    // Test that the drawer can be opened and closed
    const button = canvasElement.querySelector("button");
    if (!button) {
      throw new Error("Open button not found");
    }

    // The actual interaction testing would require more complex setup
    // For now, just verify the component renders
    const drawer = canvasElement.querySelector("[class*='fixed inset-y-0 right-0']");
    if (!drawer) {
      throw new Error("Drawer container not found");
    }
  },
};
