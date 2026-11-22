const express = require("express");
const mongoose = require("mongoose");

const Exam = require("../models/Exam");
const Attempt = require("../models/Attempt");
const User = require("../models/User");

const {
  authenticateToken,
  requireTeacher,
} = require("../middleware/auth");

const router = express.Router();

// Helper: Calculate academic letter grade from percentage
function calculateGrade(percentage) {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  return "F";
}

// Helper: Calculate performance category
function calculatePerformanceStatus(percentage) {
  if (percentage >= 80) return "Excellent";
  if (percentage >= 65) return "Good";
  if (percentage >= 50) return "Average";
  return "Needs Improvement";
}

// Helper: Generate personalized rule-based study suggestions from real attempt data
function generateStudentSuggestions(attempts) {
  if (!attempts || attempts.length === 0) {
    return {
      hasAttempts: false,
      overallAvg: 0,
      scoreTier: "New",
      summary: "Welcome to EduNexa! You haven't submitted any exams yet.",
      actionableTips: [
        "Browse the available exams on your dashboard to test your knowledge.",
        "Ensure a quiet environment and stable connection before beginning an exam.",
        "Manage your time carefully using the on-screen countdown timer.",
      ],
      weakTopics: [],
      strongTopics: [],
      hasTopicData: false,
      trendText: "No prior attempts to analyze performance trend.",
      trendDirection: "stable",
    };
  }

  // Calculate cumulative average
  let totalScore = 0;
  let totalMarks = 0;
  attempts.forEach((a) => {
    totalScore += a.score || 0;
    totalMarks += a.totalMarks || 0;
  });
  const overallAvg = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0;

  // Topic analysis using actual question topic metadata if available
  const topicStats = {};
  let foundAnyTopic = false;

  attempts.forEach((attempt) => {
    if (!attempt.exam || !Array.isArray(attempt.exam.questions)) return;

    const questionMap = new Map();
    attempt.exam.questions.forEach((q) => {
      questionMap.set(q._id.toString(), q);
    });

    (attempt.answers || []).forEach((ans) => {
      const q = questionMap.get(ans.questionId?.toString());
      if (q && typeof q.topic === "string" && q.topic.trim().length > 0) {
        foundAnyTopic = true;
        const topicName = q.topic.trim();
        if (!topicStats[topicName]) {
          topicStats[topicName] = { earned: 0, total: 0 };
        }
        topicStats[topicName].total += q.marks || 1;
        if (ans.selectedAnswer === q.correctAnswer) {
          topicStats[topicName].earned += q.marks || 1;
        }
      }
    });
  });

  const weakTopics = [];
  const strongTopics = [];

  if (foundAnyTopic) {
    Object.entries(topicStats).forEach(([topic, stat]) => {
      const accuracy = stat.total > 0 ? Math.round((stat.earned / stat.total) * 100) : 0;
      if (accuracy < 60) {
        weakTopics.push({
          topic,
          accuracy,
          recommendation: `Dedicate focused revision to ${topic} (${accuracy}% accuracy recorded).`,
        });
      } else if (accuracy >= 80) {
        strongTopics.push({
          topic,
          accuracy,
        });
      }
    });
  }

  // Honest score-based suggestions without inventing fake topics
  let scoreTier = "";
  let summary = "";
  const actionableTips = [];

  if (overallAvg >= 85) {
    scoreTier = "Distinction";
    summary = `Outstanding performance! You are maintaining an average of ${overallAvg}%, demonstrating solid subject mastery.`;
    actionableTips.push("Continue practicing multi-concept and timed practice questions.");
    actionableTips.push("Form or join peer study groups to explain complex problems and reinforce retention.");
    actionableTips.push("Keep up your disciplined preparation routine for upcoming exams.");
  } else if (overallAvg >= 70) {
    scoreTier = "Proficient";
    summary = `Commendable work! You hold an average of ${overallAvg}%. With targeted revision, you can push into the distinction band.`;
    actionableTips.push("Review each question where points were lost to identify conceptual versus calculation errors.");
    actionableTips.push("Allocate 20-30 minutes of daily active recall on core topics before attempting the next exam.");
    actionableTips.push("Pace yourself so you have 2-3 minutes at the end of each assessment to double-check selected answers.");
  } else if (overallAvg >= 50) {
    scoreTier = "Passing";
    summary = `You have achieved a passing average of ${overallAvg}%. Strengthen your foundational knowledge to prevent marks from slipping.`;
    actionableTips.push("Revisit lecture notes and textbook summaries for topics where doubts arose during the test.");
    actionableTips.push("Create summary flashcards for definitions, core formulas, and key processes.");
    actionableTips.push("Read every question stem and all multiple-choice options thoroughly before picking an option.");
  } else {
    scoreTier = "Needs Support";
    summary = `Your overall average is ${overallAvg}%, which is currently below the passing threshold. A structured revision plan is advised.`;
    actionableTips.push("Systematically review textbook chapters and lecture recordings from the start of the syllabus.");
    actionableTips.push("Consult your course instructor or tutor for targeted guidance on complex modules.");
    actionableTips.push("Practice untimed self-quizzes first to build subject confidence before timed assessments.");
  }

  // Trend analysis across sequential attempts
  let trendText = "Consistent baseline established.";
  let trendDirection = "stable";

  if (attempts.length >= 2) {
    const latestPct = attempts[0].totalMarks > 0 ? Math.round((attempts[0].score / attempts[0].totalMarks) * 100) : 0;
    const prevPct = attempts[1].totalMarks > 0 ? Math.round((attempts[1].score / attempts[1].totalMarks) * 100) : 0;
    const diff = latestPct - prevPct;

    if (diff > 5) {
      trendDirection = "up";
      trendText = `Upward trajectory! Your latest attempt (${latestPct}%) improved by +${diff}% compared to your previous attempt (${prevPct}%).`;
    } else if (diff < -5) {
      trendDirection = "down";
      trendText = `Score dropped by ${Math.abs(diff)}% from your previous attempt (${prevPct}% → ${latestPct}%). Dedicate extra preparation before the next test.`;
    } else {
      trendDirection = "stable";
      trendText = `Steady consistency across your latest attempts (${prevPct}% → ${latestPct}%). Focused problem solving will help elevate your next score.`;
    }
  }

  return {
    hasAttempts: true,
    overallAvg,
    scoreTier,
    summary,
    actionableTips,
    hasTopicData: foundAnyTopic,
    weakTopics,
    strongTopics,
    trendText,
    trendDirection,
  };
}

// All exam routes require authentication.
router.use(authenticateToken);

// ============================================================
// GET /api/exams/teacher/dashboard
// Teacher dashboard statistics, students list, and chart data.
// Strictly isolated: Teachers only view exams THEY created and
// the student attempts for THEIR exams.
// ============================================================
router.get("/teacher/dashboard", requireTeacher, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const currentUserId = req.user.userId;

    // 1. Total students registered
    const totalStudents = await User.countDocuments({ role: "student" });

    // 2. Strict Exam Isolation: Only exams created by the logged-in teacher (or all for admin)
    const examFilter = isAdmin ? {} : { createdBy: currentUserId };
    const exams = await Exam.find(examFilter)
      .select("title description durationMinutes isPublished createdAt questions createdBy")
      .sort({ createdAt: -1 })
      .lean();

    const totalExams = exams.length;
    const publishedExams = exams.filter((e) => e.isPublished).length;
    const examIds = exams.map((e) => e._id);

    // 3. Strict Attempt Isolation: Only attempts on THIS teacher's exams
    const attempts = await Attempt.find({ exam: { $in: examIds } })
      .populate("student", "name email")
      .populate("exam", "title")
      .sort({ submittedAt: -1 })
      .lean();

    const completedAttempts = attempts.length;

    let totalMarksSum = 0;
    let totalScoreSum = 0;
    let passedAttemptsCount = 0;

    attempts.forEach((attempt) => {
      totalScoreSum += attempt.score || 0;
      totalMarksSum += attempt.totalMarks || 0;
      const pct = attempt.totalMarks > 0 ? (attempt.score / attempt.totalMarks) * 100 : 0;
      if (pct >= 50) {
        passedAttemptsCount++;
      }
    });

    const averageMarks = completedAttempts > 0
      ? Math.round((totalScoreSum / completedAttempts) * 10) / 10
      : 0;

    const averagePercentage = totalMarksSum > 0
      ? Math.round((totalScoreSum / totalMarksSum) * 1000) / 10
      : 0;

    const passPercentage = completedAttempts > 0
      ? Math.round((passedAttemptsCount / completedAttempts) * 1000) / 10
      : 0;

    // 4. Aggregate student table records for this teacher's exams
    const allStudents = await User.find({ role: "student" })
      .select("name email createdAt")
      .sort({ name: 1 })
      .lean();

    const studentAttemptsMap = new Map();
    attempts.forEach((attempt) => {
      const sId = attempt.student?._id
        ? attempt.student._id.toString()
        : attempt.student
          ? attempt.student.toString()
          : null;
      if (sId) {
        if (!studentAttemptsMap.has(sId)) {
          studentAttemptsMap.set(sId, []);
        }
        studentAttemptsMap.get(sId).push(attempt);
      }
    });

    let excellentCount = 0;
    let goodCount = 0;
    let averageCount = 0;
    let needsImprovementCount = 0;
    let notAttemptedCount = 0;

    const studentRows = allStudents.map((st) => {
      const sId = st._id.toString();
      const stAttempts = studentAttemptsMap.get(sId) || [];
      const attemptedCount = stAttempts.length;

      let stScore = 0;
      let stTotalPossible = 0;
      stAttempts.forEach((a) => {
        stScore += a.score || 0;
        stTotalPossible += a.totalMarks || 0;
      });

      const stPct = stTotalPossible > 0 ? Math.round((stScore / stTotalPossible) * 100) : 0;
      const stGrade = attemptedCount > 0 ? calculateGrade(stPct) : "N/A";
      const performanceStatus = attemptedCount === 0
        ? "Not Attempted"
        : calculatePerformanceStatus(stPct);

      if (attemptedCount === 0) {
        notAttemptedCount++;
      } else if (stPct >= 80) {
        excellentCount++;
      } else if (stPct >= 65) {
        goodCount++;
      } else if (stPct >= 50) {
        averageCount++;
      } else {
        needsImprovementCount++;
      }

      return {
        _id: st._id,
        name: st.name,
        email: st.email,
        createdAt: st.createdAt,
        examsAttempted: attemptedCount,
        totalScore: stScore,
        totalMarks: stTotalPossible,
        percentage: attemptedCount > 0 ? stPct : null,
        grade: stGrade,
        performanceStatus,
        recentExamTitle: attemptedCount > 0 ? (stAttempts[0].exam?.title || "Exam") : "None",
        recentSubmittedAt: attemptedCount > 0 ? stAttempts[0].submittedAt : null,
        attempts: stAttempts.map((a) => ({
          _id: a._id,
          examId: (a.exam?._id || a.exam)?.toString(),
          examTitle: a.exam?.title || "Exam",
          score: a.score,
          totalMarks: a.totalMarks,
          percentage: a.totalMarks > 0 ? Math.round((a.score / a.totalMarks) * 100) : 0,
          grade: calculateGrade(a.totalMarks > 0 ? Math.round((a.score / a.totalMarks) * 100) : 0),
          submittedAt: a.submittedAt,
        })),
      };
    });

    // 5. Per-Exam breakdown for comparison charts (only this teacher's exams)
    const examBreakdown = exams.map((exam) => {
      const exAttempts = attempts.filter((a) => a.exam && a.exam._id.toString() === exam._id.toString());
      let exScore = 0;
      let exTotalMarks = 0;
      let exPassCount = 0;

      exAttempts.forEach((a) => {
        exScore += a.score || 0;
        exTotalMarks += a.totalMarks || 0;
        if (a.totalMarks > 0 && (a.score / a.totalMarks) * 100 >= 50) {
          exPassCount++;
        }
      });

      const avgPct = exTotalMarks > 0 ? Math.round((exScore / exTotalMarks) * 100) : 0;
      const passRate = exAttempts.length > 0 ? Math.round((exPassCount / exAttempts.length) * 100) : 0;

      return {
        _id: exam._id,
        title: exam.title,
        isPublished: exam.isPublished,
        durationMinutes: exam.durationMinutes,
        questionsCount: exam.questions?.length || 0,
        attemptsCount: exAttempts.length,
        averagePercentage: avgPct,
        passRate,
      };
    });

    return res.json({
      stats: {
        totalStudents,
        totalExams,
        publishedExams,
        completedAttempts,
        averageMarks,
        averagePercentage,
        passPercentage,
      },
      chartData: {
        distribution: [
          { label: "Excellent (≥80%)", count: excellentCount, color: "#10b981" },
          { label: "Good (65-79%)", count: goodCount, color: "#3b82f6" },
          { label: "Average (50-64%)", count: averageCount, color: "#f59e0b" },
          { label: "Needs Improvement (<50%)", count: needsImprovementCount, color: "#ef4444" },
          { label: "Not Attempted", count: notAttemptedCount, color: "#94a3b8" },
        ],
        examBreakdown,
      },
      students: studentRows,
      exams: exams.map((e) => ({ _id: e._id, title: e.title })),
    });
  } catch (error) {
    console.error("Teacher dashboard error:", error.message);
    return res.status(500).json({
      message: "Could not load teacher dashboard data.",
    });
  }
});

// ============================================================
// GET /api/exams/mine
// List exams created by the logged-in teacher ONLY.
// ============================================================
router.get("/mine", requireTeacher, async (req, res) => {
  try {
    const exams = await Exam.find({
      createdBy: req.user.userId,
    })
      .select(
        "title description durationMinutes createdAt isPublished questions.text questions.options questions.marks questions.topic"
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ exams });
  } catch (error) {
    console.error("Teacher exams error:", error.message);

    return res.status(500).json({
      message: "Could not load your exams.",
    });
  }
});

// ============================================================
// GET /api/exams
// List published exams for students.
// Correct answers are never returned.
// ============================================================
router.get("/", async (req, res) => {
  try {
    const exams = await Exam.find({
      isPublished: true,
    })
      .select(
        "title description durationMinutes createdAt questions.text questions.options questions.marks questions.topic"
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ exams });
  } catch (error) {
    console.error("List exams error:", error.message);

    return res.status(500).json({
      message: "Could not load exams.",
    });
  }
});

// ============================================================
// POST /api/exams
// Create a new unpublished exam.
// Teachers only.
// ============================================================
router.post("/", requireTeacher, async (req, res) => {
  try {
    const {
      title,
      description,
      questions,
      durationMinutes,
    } = req.body;

    // Validate exam details.
    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 150 ||
      !Array.isArray(questions) ||
      questions.length < 1 ||
      questions.length > 100 ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 300
    ) {
      return res.status(400).json({
        message:
          "Provide a valid title, 1–100 questions, and a duration of 1–300 minutes.",
      });
    }

    // Validate description.
    if (
      description !== undefined &&
      (typeof description !== "string" ||
        description.length > 1000)
    ) {
      return res.status(400).json({
        message:
          "Description must be text of at most 1000 characters.",
      });
    }

    // Validate every question.
    for (const question of questions) {
      if (
        !question ||
        typeof question.text !== "string" ||
        !question.text.trim() ||
        question.text.trim().length > 1000 ||
        !Array.isArray(question.options) ||
        question.options.length < 2 ||
        question.options.length > 6 ||
        !question.options.every(
          (option) =>
            typeof option === "string" &&
            option.trim().length > 0 &&
            option.trim().length <= 300
        ) ||
        !Number.isInteger(question.correctAnswer) ||
        question.correctAnswer < 0 ||
        question.correctAnswer >= question.options.length ||
        (question.marks !== undefined &&
          (!Number.isInteger(question.marks) ||
            question.marks < 1 ||
            question.marks > 100)) ||
        (question.topic !== undefined &&
          (typeof question.topic !== "string" ||
            question.topic.length > 100))
      ) {
        return res.status(400).json({
          message:
            "A question has invalid text, options, correct answer, marks, or topic.",
        });
      }
    }

    // Create the exam as a draft.
    const exam = await Exam.create({
      title: title.trim(),

      description:
        typeof description === "string"
          ? description.trim()
          : "",

      durationMinutes,

      questions: questions.map((question) => ({
        text: question.text.trim(),

        options: question.options.map((option) =>
          option.trim()
        ),

        correctAnswer: question.correctAnswer,

        marks: question.marks ?? 1,

        topic: typeof question.topic === "string" ? question.topic.trim() : "",
      })),

      createdBy: req.user.userId,

      isPublished: false,
    });

    return res.status(201).json({
      message: "Exam created as a draft.",
      exam: {
        _id: exam._id,
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        questionCount: exam.questions.length,
        isPublished: exam.isPublished,
        createdAt: exam.createdAt,
      },
    });
  } catch (error) {
    console.error("Create exam error:", error.message);

    return res.status(500).json({
      message: "Could not create exam.",
    });
  }
});

// ============================================================
// POST /api/exams/:id/publish
// Publish an exam owned by the logged-in teacher.
// Teachers can only publish exams THEY created.
// ============================================================
router.post("/:id/publish", requireTeacher, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid exam ID.",
      });
    }

    const isAdmin = req.user.role === "admin";
    const query = isAdmin
      ? { _id: req.params.id }
      : { _id: req.params.id, createdBy: req.user.userId };

    const exam = await Exam.findOne(query);

    if (!exam) {
      return res.status(403).json({
        message: "Exam not found or you do not have permission to publish this exam.",
      });
    }

    if (!exam.questions || exam.questions.length === 0) {
      return res.status(400).json({
        message: "An exam must contain questions before publishing.",
      });
    }

    exam.isPublished = true;
    await exam.save();

    return res.json({
      message: "Exam published successfully.",
      examId: exam._id,
      isPublished: exam.isPublished,
    });
  } catch (error) {
    console.error("Publish exam error:", error.message);

    return res.status(500).json({
      message: "Could not publish exam.",
    });
  }
});

// ============================================================
// GET /api/exams/my-results
// Get the logged-in student's exam history, grades, and rule-based suggestions.
// Students only access their own results.
// ============================================================
router.get("/my-results", async (req, res) => {
  try {
    const attempts = await Attempt.find({
      student: req.user.userId,
    })
      .populate("exam", "title description questions")
      .sort({ submittedAt: -1 })
      .lean();

    const results = attempts.map((attempt) => {
      const percentage =
        attempt.totalMarks > 0
          ? Math.round((attempt.score / attempt.totalMarks) * 100)
          : 0;
      const grade = calculateGrade(percentage);
      const status = percentage >= 50 ? "Passed" : "Failed";

      return {
        _id: attempt._id,
        examId: attempt.exam?._id,
        examTitle: attempt.exam?.title || "Deleted Exam",
        description: attempt.exam?.description || "",
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        percentage,
        grade,
        status,
        submittedAt: attempt.submittedAt,
        answersCount: attempt.answers?.length || 0,
      };
    });

    // Generate personalized rule-based improvement suggestions
    const suggestions = generateStudentSuggestions(attempts);

    return res.json({ results, suggestions });
  } catch (error) {
    console.error("Fetch results error:", error.message);
    return res.status(500).json({ message: "Could not fetch exam results." });
  }
});

// ============================================================
// GET /api/exams/:id
// Get one published exam.
// Do not return correct answers.
// ============================================================
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid exam ID.",
      });
    }

    const exam = await Exam.findOne({
      _id: req.params.id,
      isPublished: true,
    })
      .select("-questions.correctAnswer")
      .lean();

    if (!exam) {
      return res.status(404).json({
        message: "Published exam not found.",
      });
    }

    return res.json({
      exam: {
        _id: exam._id,
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.durationMinutes,

        questions: exam.questions.map((question) => ({
          _id: question._id,
          text: question.text,
          options: question.options,
          marks: question.marks,
          topic: question.topic || "",
        })),
      },
    });
  } catch (error) {
    console.error("Get exam error:", error.message);

    return res.status(500).json({
      message: "Could not load exam.",
    });
  }
});

// ============================================================
// POST /api/exams/:id/submit
// Submit answers and calculate the score securely on the server.
// ============================================================
router.post("/:id/submit", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid exam ID.",
      });
    }

    const exam = await Exam.findOne({
      _id: req.params.id,
      isPublished: true,
    });

    if (!exam) {
      return res.status(404).json({
        message: "Published exam not found.",
      });
    }

    const { answers, autoSubmit } = req.body;

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        message: "Answers must be provided as an array.",
      });
    }

    if (!autoSubmit && answers.length !== exam.questions.length) {
      return res.status(400).json({
        message: "Please answer every question before submitting.",
      });
    }

    const questionMap = new Map(
      exam.questions.map((question) => [
        question._id.toString(),
        question,
      ])
    );

    const seen = new Set();
    const savedAnswers = [];

    let score = 0;

    for (const answer of answers) {
      if (autoSubmit && answer == null) {
        continue;
      }
      if (
        !answer ||
        typeof answer.questionId !== "string" ||
        !mongoose.isValidObjectId(answer.questionId) ||
        !Number.isInteger(answer.selectedAnswer)
      ) {
        return res.status(400).json({
          message:
            "Each answer must contain a valid questionId and selectedAnswer.",
        });
      }

      const questionId = answer.questionId.toString();

      const question = questionMap.get(questionId);

      if (!question || seen.has(questionId)) {
        return res.status(400).json({
          message:
            "An answer refers to an unknown or duplicate question.",
        });
      }

      if (
        answer.selectedAnswer < 0 ||
        answer.selectedAnswer >= question.options.length
      ) {
        return res.status(400).json({
          message:
            "Selected answer is outside the available options.",
        });
      }

      seen.add(questionId);

      if (
        answer.selectedAnswer === question.correctAnswer
      ) {
        score += question.marks;
      }

      savedAnswers.push({
        questionId: question._id,
        selectedAnswer: answer.selectedAnswer,
      });
    }

    const totalMarks = exam.questions.reduce(
      (sum, question) => sum + question.marks,
      0
    );

    // Save the attempt.
    const attempt = await Attempt.create({
      exam: exam._id,
      student: req.user.userId,
      answers: savedAnswers,
      score,
      totalMarks,
    });

    const percentage = totalMarks
      ? Math.round((score / totalMarks) * 10000) / 100
      : 0;
    const grade = calculateGrade(percentage);
    const status = percentage >= 50 ? "Passed" : "Failed";

    return res.status(201).json({
      message: "Exam submitted successfully.",
      attemptId: attempt._id,
      score,
      totalMarks,
      percentage,
      grade,
      status,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "You have already submitted this exam.",
      });
    }

    console.error("Submit exam error:", error.message);

    return res.status(500).json({
      message: "Could not submit exam.",
    });
  }
});

module.exports = router;
