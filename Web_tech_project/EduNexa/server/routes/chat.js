const express = require("express");
const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");
const Exam = require("../models/Exam");
const Attempt = require("../models/Attempt");
const { authenticateToken, requireTeacher } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// ============================================================
// GET /api/chat/messages
// Fetch messages for the current user.
// STRICT PRIVACY: Messages sent to Teacher A are visible ONLY to
// Teacher A and the sending student. Another teacher NEVER sees them.
// ============================================================
router.get("/messages", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { contactId } = req.query;

    let query = {};

    if (contactId && mongoose.isValidObjectId(contactId)) {
      // 1-on-1 private conversation between logged-in user and the selected contact ONLY
      query = {
        $or: [
          { sender: userId, recipient: contactId },
          { sender: contactId, recipient: userId },
        ],
      };
    } else {
      // Fallback: only messages directly sent by or directly sent to the logged-in user
      query = {
        $or: [
          { sender: userId },
          { recipient: userId },
        ],
      };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: 1 })
      .limit(300)
      .lean();

    return res.json({ messages });
  } catch (error) {
    console.error("Get messages error:", error.message);
    return res.status(500).json({ message: "Could not fetch messages." });
  }
});

// ============================================================
// POST /api/chat/send
// Send a message strictly to a designated recipient
// ============================================================
router.post("/send", async (req, res) => {
  try {
    const { text, recipientId, examId } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ message: "Message text is required." });
    }

    if (!recipientId || !mongoose.isValidObjectId(recipientId)) {
      return res.status(400).json({ message: "Please select a specific teacher or student recipient." });
    }

    const sender = await User.findById(req.user.userId).select("name role");
    if (!sender) {
      return res.status(404).json({ message: "Sender account not found." });
    }

    const recipientUser = await User.findById(recipientId).select("name role");
    if (!recipientUser) {
      return res.status(404).json({ message: "Recipient user not found." });
    }

    let examDoc = null;
    if (examId && mongoose.isValidObjectId(examId)) {
      examDoc = await Exam.findById(examId).select("title");
    }

    const message = await Message.create({
      sender: sender._id,
      senderName: sender.name,
      senderRole: sender.role,
      recipient: recipientUser._id,
      recipientName: recipientUser.name,
      exam: examDoc ? examDoc._id : null,
      examTitle: examDoc ? examDoc.title : "",
      text: text.trim(),
      isReminder: false,
    });

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Send message error:", error.message);
    return res.status(500).json({ message: "Could not send message." });
  }
});

// ============================================================
// POST /api/chat/reminder
// Teacher sends an exam reminder
// ============================================================
router.post("/reminder", requireTeacher, async (req, res) => {
  try {
    const { examId, studentId, customNote } = req.body;

    if (!examId || !mongoose.isValidObjectId(examId)) {
      return res.status(400).json({ message: "Valid examId is required." });
    }

    const exam = await Exam.findById(examId).select("title durationMinutes createdBy");
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    const sender = await User.findById(req.user.userId).select("name role");

    let recipientUser = null;
    if (studentId && mongoose.isValidObjectId(studentId)) {
      recipientUser = await User.findById(studentId).select("name");
    }

    const reminderText = customNote && customNote.trim()
      ? customNote.trim()
      : `⏰ Exam Reminder from ${sender.name}: "${exam.title}" is live! Duration: ${exam.durationMinutes} mins. Please complete your assessment before the submission deadline.`;

    const message = await Message.create({
      sender: sender._id,
      senderName: sender.name,
      senderRole: sender.role,
      recipient: recipientUser ? recipientUser._id : null,
      recipientName: recipientUser ? recipientUser.name : "All Enrolled Students",
      exam: exam._id,
      examTitle: exam.title,
      text: reminderText,
      isReminder: true,
    });

    return res.status(201).json({
      message: "Reminder dispatched successfully.",
      reminder: message,
    });
  } catch (error) {
    console.error("Reminder error:", error.message);
    return res.status(500).json({ message: "Could not dispatch reminder." });
  }
});

// ============================================================
// GET /api/chat/reminders
// Get pending exam reminders for students
// ============================================================
router.get("/reminders", async (req, res) => {
  try {
    // 1. Published exams the student has NOT yet attempted
    const myAttempts = await Attempt.find({ student: req.user.userId }).select("exam").lean();
    const attemptedExamIds = new Set(myAttempts.map((a) => a.exam.toString()));

    const publishedExams = await Exam.find({ isPublished: true })
      .select("title description durationMinutes createdAt questions")
      .sort({ createdAt: -1 })
      .lean();

    const pendingExams = publishedExams
      .filter((exam) => !attemptedExamIds.has(exam._id.toString()))
      .map((exam) => ({
        _id: exam._id,
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        questionsCount: exam.questions?.length || 0,
        createdAt: exam.createdAt,
      }));

    // 2. Explicit teacher reminders addressed to this student or broadcast
    const reminderMessages = await Message.find({
      isReminder: true,
      $or: [{ recipient: req.user.userId }, { recipient: null }],
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json({
      pendingCount: pendingExams.length,
      pendingExams,
      reminderMessages,
    });
  } catch (error) {
    console.error("Reminders fetch error:", error.message);
    return res.status(500).json({ message: "Could not fetch reminders." });
  }
});

// ============================================================
// GET /api/chat/contacts
// List users for 1-on-1 private conversation selection
// ============================================================
router.get("/contacts", async (req, res) => {
  try {
    const isTeacher = req.user.role === "teacher" || req.user.role === "admin";
    // If teacher, return students; if student, return teachers
    const targetRole = isTeacher ? "student" : "teacher";

    const contacts = await User.find({ role: targetRole })
      .select("name email role createdAt")
      .sort({ name: 1 })
      .lean();

    return res.json({ contacts });
  } catch (error) {
    console.error("Contacts error:", error.message);
    return res.status(500).json({ message: "Could not fetch contacts." });
  }
});

module.exports = router;
