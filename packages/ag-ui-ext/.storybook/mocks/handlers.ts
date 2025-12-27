import { http, HttpResponse } from "msw";
import {
  mockUser,
  mockProgress,
  mockSubjects,
  mockQuestions,
  mockStudyPlan,
  mockTutorMessages,
  mockStats,
} from "../../src/fixtures/mockData";

export const handlers = [
  // User endpoints
  http.get("/api/user", () => {
    return HttpResponse.json(mockUser);
  }),

  http.get("/api/user/progress", () => {
    return HttpResponse.json(mockProgress);
  }),

  // Subject endpoints
  http.get("/api/subjects", () => {
    return HttpResponse.json(mockSubjects);
  }),

  http.get("/api/subjects/:id", ({ params }) => {
    const subject = mockSubjects.find((s) => s.id === params.id);
    if (!subject) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(subject);
  }),

  // Question endpoints
  http.get("/api/questions", ({ request }) => {
    const url = new URL(request.url);
    const subject = url.searchParams.get("subject");
    const difficulty = url.searchParams.get("difficulty");

    let filteredQuestions = mockQuestions;

    if (subject) {
      filteredQuestions = filteredQuestions.filter(
        (q) => q.subject.toLowerCase() === subject.toLowerCase()
      );
    }

    if (difficulty) {
      filteredQuestions = filteredQuestions.filter(
        (q) => q.difficulty.toLowerCase() === difficulty.toLowerCase()
      );
    }

    return HttpResponse.json(filteredQuestions);
  }),

  http.get("/api/questions/:id", ({ params }) => {
    const question = mockQuestions.find((q) => q.id === params.id);
    if (!question) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(question);
  }),

  // Study plan endpoints
  http.get("/api/study-plan", () => {
    return HttpResponse.json(mockStudyPlan);
  }),

  http.put(
    "/api/study-plan/:dayId/topics/:topicId",
    async ({ params, request }) => {
      const updates = await request.json();
      // Simulate updating a topic
      return HttpResponse.json({
        success: true,
        message: "Topic updated successfully",
        ...updates,
      });
    }
  ),

  // Tutor endpoints
  http.get("/api/tutor/messages", () => {
    return HttpResponse.json(mockTutorMessages);
  }),

  http.post("/api/tutor/messages", async ({ request }) => {
    const message = await request.json();
    const response = {
      id: `m${Date.now()}`,
      type: "assistant" as const,
      content: `I understand your question about "${message.content}". Let me help you with that...`,
      timestamp: new Date().toISOString(),
      attachments: [],
    };
    return HttpResponse.json(response);
  }),

  // Stats endpoints
  http.get("/api/stats/daily", () => {
    return HttpResponse.json(mockStats.dailyStats);
  }),

  http.get("/api/stats/radar", () => {
    return HttpResponse.json(mockStats.subjectRadar);
  }),

  // Practice session endpoints
  http.post("/api/practice/start", async ({ request }) => {
    const { subject, difficulty } = await request.json();
    return HttpResponse.json({
      sessionId: `session_${Date.now()}`,
      questions: mockQuestions.slice(0, 5), // Return first 5 questions
      startTime: new Date().toISOString(),
    });
  }),

  http.post("/api/practice/answer", async ({ request }) => {
    const { questionId, answer, timeSpent } = await request.json();
    const question = mockQuestions.find((q) => q.id === questionId);
    const isCorrect = question?.correctAnswer === answer;

    return HttpResponse.json({
      correct: isCorrect,
      explanation: question?.explanation,
      correctAnswer: question?.correctAnswer,
      timeSpent,
      xpEarned: isCorrect ? 10 : 3,
    });
  }),
];
