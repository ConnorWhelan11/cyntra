// Mock data for Storybook stories and testing

export const mockUser = {
  id: "1",
  name: "Dr. Sarah Chen",
  email: "sarah.chen@medschool.edu",
  avatar:
    "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&h=150&fit=crop&crop=face",
  studyStreak: 22,
  totalXP: 12450,
  level: 15,
  readinessScore: 0.78,
  mcatDate: "2024-08-15",
  weakestSubject: "Organic Chemistry",
  strongestSubject: "Biology",
};

export const mockProgress = {
  totalQuestions: 2847,
  correctAnswers: 2156,
  accuracy: 0.757,
  averageTime: 92, // seconds
  streakCount: 15,
  lastStudySession: "2024-01-15T14:30:00Z",
  weeklyGoal: 200,
  weeklyProgress: 156,
};

export const mockSubjects = [
  {
    id: "bio",
    name: "Biology",
    progress: 0.85,
    accuracy: 0.82,
    timeSpent: 45.5, // hours
    questionsAnswered: 542,
    color: "emerald",
  },
  {
    id: "chem",
    name: "Chemistry",
    progress: 0.72,
    accuracy: 0.74,
    timeSpent: 38.2,
    questionsAnswered: 458,
    color: "cyan",
  },
  {
    id: "physics",
    name: "Physics",
    progress: 0.68,
    accuracy: 0.71,
    timeSpent: 32.1,
    questionsAnswered: 387,
    color: "magenta",
  },
  {
    id: "psych",
    name: "Psychology",
    progress: 0.79,
    accuracy: 0.78,
    timeSpent: 28.7,
    questionsAnswered: 412,
    color: "emerald",
  },
];

export const mockQuestions = [
  {
    id: "q1",
    subject: "Biology",
    topic: "Cell Biology",
    difficulty: "Medium",
    stem: "Which of the following best describes the primary function of mitochondria?",
    choices: [
      "Protein synthesis",
      "ATP production",
      "DNA replication",
      "Waste removal",
    ],
    correctAnswer: 1,
    explanation:
      "Mitochondria are known as the powerhouses of the cell because their primary function is to produce ATP through cellular respiration.",
    timeLimit: 90,
    tags: ["cellular-respiration", "organelles"],
  },
  {
    id: "q2",
    subject: "Chemistry",
    topic: "Organic Chemistry",
    difficulty: "Hard",
    stem: "What is the major product when 2-methylpropene undergoes hydrobromination in the presence of peroxides?",
    choices: [
      "1-bromo-2-methylpropane",
      "2-bromo-2-methylpropane",
      "1-bromo-1-methylpropane",
      "2-bromo-1-methylpropane",
    ],
    correctAnswer: 0,
    explanation:
      "In the presence of peroxides, hydrobromination follows anti-Markovnikov addition, placing the bromine on the less substituted carbon.",
    timeLimit: 120,
    tags: ["alkenes", "addition-reactions", "anti-markovnikov"],
  },
];

export const mockStudyPlan = [
  {
    id: "day1",
    date: "2024-01-15",
    topics: [
      {
        id: "t1",
        subject: "Biology",
        topic: "Cellular Respiration",
        estimatedTime: 45,
        difficulty: "Medium",
        completed: true,
        score: 0.85,
      },
      {
        id: "t2",
        subject: "Chemistry",
        topic: "Acid-Base Reactions",
        estimatedTime: 60,
        difficulty: "Hard",
        completed: false,
        score: null,
      },
    ],
    totalTime: 105,
    completedTime: 45,
    status: "in-progress",
  },
  {
    id: "day2",
    date: "2024-01-16",
    topics: [
      {
        id: "t3",
        subject: "Physics",
        topic: "Thermodynamics",
        estimatedTime: 50,
        difficulty: "Medium",
        completed: false,
        score: null,
      },
    ],
    totalTime: 50,
    completedTime: 0,
    status: "pending",
  },
];

export const mockTutorMessages = [
  {
    id: "m1",
    type: "assistant" as const,
    content:
      "I notice you're struggling with organic chemistry reactions. Let's focus on understanding the mechanism behind hydrobromination.",
    timestamp: "2024-01-15T10:30:00Z",
    attachments: [],
  },
  {
    id: "m2",
    type: "user" as const,
    content:
      "I keep getting confused about when to apply Markovnikov vs anti-Markovnikov rules.",
    timestamp: "2024-01-15T10:32:00Z",
    attachments: [],
  },
  {
    id: "m3",
    type: "assistant" as const,
    content:
      "Great question! The key is to look for the presence of peroxides. Without peroxides, follow Markovnikov's rule. With peroxides, it's anti-Markovnikov.",
    timestamp: "2024-01-15T10:33:00Z",
    attachments: [
      {
        type: "diagram",
        title: "Hydrobromination Mechanism",
        url: "/diagrams/hydrobromination.svg",
      },
    ],
  },
];

export const mockStats = {
  dailyStats: [
    { date: "2024-01-09", questions: 25, accuracy: 0.72, timeSpent: 45 },
    { date: "2024-01-10", questions: 30, accuracy: 0.77, timeSpent: 52 },
    { date: "2024-01-11", questions: 22, accuracy: 0.73, timeSpent: 38 },
    { date: "2024-01-12", questions: 28, accuracy: 0.79, timeSpent: 48 },
    { date: "2024-01-13", questions: 35, accuracy: 0.81, timeSpent: 62 },
    { date: "2024-01-14", questions: 27, accuracy: 0.75, timeSpent: 44 },
    { date: "2024-01-15", questions: 31, accuracy: 0.78, timeSpent: 55 },
  ],
  subjectRadar: [
    { subject: "Biology", score: 85 },
    { subject: "Chemistry", score: 72 },
    { subject: "Physics", score: 68 },
    { subject: "Psychology", score: 79 },
    { subject: "Sociology", score: 74 },
    { subject: "Critical Analysis", score: 81 },
  ],
};
