import { useCallback, useEffect, useMemo, useRef, useState } from "react";
const API = "https://assessment-student-portal.onrender.com/api";

function calculateGrade(percentage) {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  return "F";
}

function calculatePerformanceStatus(percentage) {
  if (percentage >= 80) return "Excellent";
  if (percentage >= 65) return "Good";
  if (percentage >= 50) return "Average";
  return "Needs Improvement";
}

function App() {
  const [user, setUser] = useState(() => {
    try {
      const token = localStorage.getItem("Edunet_token");
      const savedUser = localStorage.getItem("Edunet_user");
      return token && savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [exams, setExams] = useState([]);
  const [activeExam, setActiveExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const autoSubmitStarted = useRef(false);

  // Student results & suggestions state
  const [myResults, setMyResults] = useState([]);
  const [suggestions, setSuggestions] = useState(null);

  // Reminders state
  const [pendingReminders, setPendingReminders] = useState({
    pendingCount: 0,
    pendingExams: [],
    reminderMessages: [],
  });

  // Chat state
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [chatText, setChatText] = useState("");
  const [chatExamId, setChatExamId] = useState("");

  // Teacher dashboard state
  const [teacherStats, setTeacherStats] = useState(null);
  const [teacherStudents, setTeacherStudents] = useState([]);
  const [teacherExamsList, setTeacherExamsList] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedExamFilter, setSelectedExamFilter] = useState("all");
  const [selectedPerformanceFilter, setSelectedPerformanceFilter] = useState("all");
  const [expandedStudentId, setExpandedStudentId] = useState(null);

  // Exam creation state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [questions, setQuestions] = useState([
    {
      text: "",
      options: ["", "", "", ""],
      correctAnswer: 0,
      marks: 1,
      topic: "",
    },
  ]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("home");

  // Handle unauthorized event decoupled from effect
  useEffect(() => {
    const handleUnauthorized = () => setUser(null);
    window.addEventListener("edunet:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("edunet:unauthorized", handleUnauthorized);
  }, []);

  const request = useCallback(async (path, options = {}) => {
    const token = localStorage.getItem("Edunet_token");

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("Edunet_token");
        localStorage.removeItem("Edunet_user");
        window.dispatchEvent(new CustomEvent("edunet:unauthorized"));
      }

      throw new Error(data.message || "The request failed.");
    }

    return data;
  }, []);

  const loadExams = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const data = await request("/exams");
      setExams(Array.isArray(data) ? data : data.exams || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadTeacherDashboard = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const data = await request("/exams/teacher/dashboard");
      setTeacherStats(data.stats || null);
      setTeacherStudents(data.students || []);
      setTeacherExamsList(data.exams || []);
      setChartData(data.chartData || null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadTeacherExams = useCallback(async () => {
    setLoading(true);

    try {
      const data = await request("/exams/mine");
      setExams(Array.isArray(data) ? data : data.exams || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadMyResults = useCallback(async () => {
    setLoading(true);

    try {
      const data = await request("/exams/my-results");
      setMyResults(data.results || []);
      setSuggestions(data.suggestions || null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadReminders = useCallback(async () => {
    try {
      const data = await request("/chat/reminders");
      setPendingReminders({
        pendingCount: data.pendingCount || 0,
        pendingExams: data.pendingExams || [],
        reminderMessages: data.reminderMessages || [],
      });
    } catch (error) {
      console.error("Could not fetch reminders:", error.message);
    }
  }, [request]);

  const loadChat = useCallback(async (contactId = null) => {
    try {
      const contactsData = await request("/chat/contacts");
      const loadedContacts = contactsData.contacts || [];
      setContacts(loadedContacts);

      let targetContact = null;
      if (contactId) {
        targetContact = loadedContacts.find((c) => c._id === contactId) || null;
      }
      if (!targetContact && loadedContacts.length > 0) {
        targetContact = loadedContacts[0];
      }

      setSelectedContact(targetContact);

      if (targetContact) {
        const data = await request(`/chat/messages?contactId=${targetContact._id}`);
        setMessages(data.messages || []);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error("Could not fetch chat:", error.message);
    }
  }, [request]);

  // Initial load depending on role and view
  useEffect(() => {
    let isCancelled = false;
    if (!user) return;

    if (user.role === "student") {
      request("/chat/reminders")
        .then((data) => {
          if (!isCancelled) {
            setPendingReminders({
              pendingCount: data.pendingCount || 0,
              pendingExams: data.pendingExams || [],
              reminderMessages: data.reminderMessages || [],
            });
          }
        })
        .catch(() => {});

      if (view === "home") {
        request("/exams")
          .then((data) => {
            if (!isCancelled) {
              setExams(Array.isArray(data) ? data : data.exams || []);
            }
          })
          .catch((err) => {
            if (!isCancelled) setMessage(err.message);
          });
      }
    } else if (
      (user.role === "teacher" || user.role === "admin") &&
      (view === "home" || view === "teacherDashboard")
    ) {
      request("/exams/teacher/dashboard")
        .then((data) => {
          if (!isCancelled) {
            setTeacherStats(data.stats || null);
            setTeacherStudents(data.students || []);
            setTeacherExamsList(data.exams || []);
            setChartData(data.chartData || null);
          }
        })
        .catch((err) => {
          if (!isCancelled) setMessage(err.message);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [user, view, request]);

  // Countdown timer for active exam
  useEffect(() => {
    if (view !== "takeExam" || !activeExam) return;

    const timerKey = `edunet_exam_deadline_${activeExam._id}`;
    let deadline = Number(localStorage.getItem(timerKey));

    if (!deadline || !Number.isFinite(deadline)) {
      deadline =
        Date.now() +
        Number(activeExam.durationMinutes || 1) * 60 * 1000;

      localStorage.setItem(timerKey, String(deadline));
    }

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000)
      );

      setTimeLeft(remaining);
    };

    updateTimer();

    const intervalId = window.setInterval(updateTimer, 1000);

    return () => window.clearInterval(intervalId);
  }, [view, activeExam]);

  // Automatically submit when time runs out
  useEffect(() => {
    if (
      view !== "takeExam" ||
      !activeExam ||
      timeLeft !== 0 ||
      autoSubmitStarted.current
    ) {
      return;
    }

    autoSubmitStarted.current = true;

    async function autoSubmitExam() {
      setLoading(true);
      setMessage("Time is up! Submitting your exam automatically...");

      try {
        const data = await request(
          `/exams/${activeExam._id}/submit`,
          {
            method: "POST",
            body: JSON.stringify({
              autoSubmit: true,
              answers: Object.entries(answers).map(
                ([questionId, selectedAnswer]) => ({
                  questionId,
                  selectedAnswer,
                })
              ),
            }),
          }
        );

        localStorage.removeItem(
          `edunet_exam_deadline_${activeExam._id}`
        );

        setResult(data);
        setView("result");
        setMessage("Time is up! Your exam was submitted automatically.");
      } catch (error) {
        setMessage(
          `Automatic submission failed: ${error.message}`
        );

        autoSubmitStarted.current = false;
      } finally {
        setLoading(false);
      }
    }

    autoSubmitExam();
  }, [timeLeft, view, activeExam, answers, request]);

  async function handleAuth(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const endpoint =
        mode === "register" ? "/auth/register" : "/auth/login";

      const payload =
        mode === "register"
          ? {
              name: name.trim(),
              email: email.trim(),
              password,
              role,
            }
          : { email: email.trim(), password };

      const data = await request(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (mode === "login" && data.user?.role !== role) {
        throw new Error(
          `This account has the role "${data.user?.role}". Please select the "${data.user?.role === "student" ? "Student" : "Teacher"}" portal tab above.`
        );
      }

      localStorage.setItem("Edunet_token", data.token);
      localStorage.setItem("Edunet_user", JSON.stringify(data.user));

      setUser(data.user);
      setPassword("");
      setView("home");
      setMessage(
        mode === "register"
          ? "Account created successfully! Welcome to EduNexa."
          : `Welcome back, ${data.user.name}!`
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("Edunet_token");
    localStorage.removeItem("Edunet_user");

    setUser(null);
    setActiveExam(null);
    setResult(null);
    setExams([]);
    setTeacherStats(null);
    setTeacherStudents([]);
    setTeacherExamsList([]);
    setChartData(null);
    setMyResults([]);
    setSuggestions(null);
    setMessages([]);
    setContacts([]);
    setSelectedContact(null);
    setView("home");
    setMessage("You have been securely logged out.");
  }

  async function openExam(examId) {
    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const exam = await request(`/exams/${examId}`);
      setActiveExam(exam.exam || exam);
      setAnswers({});
      setTimeLeft(null);
      autoSubmitStarted.current = false;
      setView("takeExam");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitExam(event) {
    event.preventDefault();

    if (!activeExam) return;

    const unanswered = (activeExam.questions || []).filter(
      (question) =>
        !Object.prototype.hasOwnProperty.call(answers, question._id)
    );

    if (unanswered.length > 0) {
      setMessage(
        `Please answer all questions before submitting. ${unanswered.length} unanswered.`
      );
      return;
    }

    if (
      !window.confirm(
        "Are you sure you want to submit your answers? This action cannot be undone."
      )
    ) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await request(
        `/exams/${activeExam._id}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            answers: Object.entries(answers).map(
              ([questionId, selectedAnswer]) => ({
                questionId,
                selectedAnswer,
              })
            ),
          }),
        }
      );

      localStorage.removeItem(`edunet_exam_deadline_${activeExam._id}`);
      setResult(data);
      setView("result");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function updateQuestion(index, field, value) {
    setQuestions((current) =>
      current.map((question, i) =>
        i === index ? { ...question, [field]: value } : question
      )
    );
  }

  function updateOption(questionIndex, optionIndex, value) {
    setQuestions((current) =>
      current.map((question, i) =>
        i === questionIndex
          ? {
              ...question,
              options: question.options.map((option, j) =>
                j === optionIndex ? value : option
              ),
            }
          : question
      )
    );
  }

  function addQuestion() {
    setQuestions((current) => [
      ...current,
      {
        text: "",
        options: ["", "", "", ""],
        correctAnswer: 0,
        marks: 1,
        topic: "",
      },
    ]);
  }

  function removeQuestion(index) {
    setQuestions((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  async function createExam(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        durationMinutes: Number(duration),
        questions: questions.map((question) => ({
          text: question.text.trim(),
          options: question.options.map((option) => option.trim()),
          correctAnswer: Number(question.correctAnswer),
          marks: Number(question.marks),
          topic: question.topic ? question.topic.trim() : "",
        })),
      };

      const data = await request("/exams", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const createdExam = data.exam || data;

      setMessage(
        `Exam "${createdExam.title || title}" created successfully as draft.`
      );
      setTitle("");
      setDescription("");
      setDuration(30);
      setQuestions([
        {
          text: "",
          options: ["", "", "", ""],
          correctAnswer: 0,
          marks: 1,
          topic: "",
        },
      ]);

      setView("teacherExams");
      await loadTeacherExams();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function publishExam(examId) {
    if (!window.confirm("Publish this exam? It will immediately become available to students.")) return;

    setLoading(true);
    setMessage("");

    try {
      await request(`/exams/${examId}/publish`, {
        method: "POST",
      });

      setMessage("Exam published successfully! Students can now access it.");
      await loadTeacherExams();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendChatMessage(e) {
    e.preventDefault();
    if (!chatText.trim()) return;

    if (!selectedContact || !selectedContact._id) {
      setMessage("Please select a specific recipient from the list to send a private message.");
      return;
    }

    try {
      const payload = {
        text: chatText.trim(),
        recipientId: selectedContact._id,
        examId: chatExamId || null,
      };

      await request("/chat/send", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setChatText("");
      await loadChat(selectedContact._id);
    } catch (error) {
      setMessage(`Failed to send message: ${error.message}`);
    }
  }

  async function sendExamReminder(examId, studentId = null) {
    const customNote = window.prompt(
      "Enter a custom reminder message for students (optional):",
      "⏰ Important: Please remember to complete your upcoming examination before the submission deadline!"
    );

    if (customNote === null) return; // cancelled

    setLoading(true);
    try {
      await request("/chat/reminder", {
        method: "POST",
        body: JSON.stringify({
          examId,
          studentId,
          customNote,
        }),
      });

      setMessage("Exam reminder broadcasted successfully to students!");
    } catch (error) {
      setMessage(`Failed to send reminder: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function goHome() {
    setActiveExam(null);
    setResult(null);
    setMessage("");
    setView("home");
  }

  // Filtered students for teacher dashboard
  const filteredStudents = useMemo(() => {
    return teacherStudents
      .filter((student) => {
        // 1. Text search by name or email
        const matchesSearch =
          !studentSearch.trim() ||
          student.name.toLowerCase().includes(studentSearch.toLowerCase().trim()) ||
          student.email.toLowerCase().includes(studentSearch.toLowerCase().trim());

        // 2. Performance filter
        const matchesPerformance =
          selectedPerformanceFilter === "all" ||
          student.performanceStatus === selectedPerformanceFilter;

        // 3. Exam filter
        const matchesExam =
          selectedExamFilter === "all" ||
          (student.attempts &&
            student.attempts.some(
              (att) => att.examId?.toString() === selectedExamFilter
            ));

        return matchesSearch && matchesPerformance && matchesExam;
      })
      .map((student) => {
        if (selectedExamFilter === "all") return student;
        const examAttempt = student.attempts?.find(
          (att) => att.examId?.toString() === selectedExamFilter
        );
        if (!examAttempt) return student;
        return {
          ...student,
          examsAttempted: 1,
          totalScore: examAttempt.score,
          totalMarks: examAttempt.totalMarks,
          percentage: examAttempt.percentage,
          grade: examAttempt.grade,
          performanceStatus: calculatePerformanceStatus(examAttempt.percentage),
        };
      });
  }, [teacherStudents, studentSearch, selectedPerformanceFilter, selectedExamFilter]);

  const getBadgeClass = (status) => {
    switch (status) {
      case "Excellent":
        return "badge-excellent";
      case "Good":
        return "badge-good";
      case "Average":
        return "badge-average";
      case "Needs Improvement":
        return "badge-improvement";
      default:
        return "badge-not-attempted";
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      {/* Top Navbar */}
      <nav
        className="navbar navbar-dark shadow-sm sticky-top"
        style={{ backgroundColor: "#17365d" }}
      >
        <div className="container d-flex flex-wrap align-items-center justify-content-between gap-2">
          <button
            className="navbar-brand fw-bold btn btn-link text-white text-decoration-none p-0 fs-3 d-flex align-items-center gap-2"
            onClick={goHome}
          >
            <span>🎓</span>
            <span>EduNexa</span>
            <span className="badge bg-light text-primary fs-6 fw-normal d-none d-sm-inline-block">
              Examination Platform
            </span>
          </button>

          <div className="d-flex align-items-center gap-3">
            {user ? (
              <>
                <div className="text-white text-end d-none d-md-block">
                  <div className="fw-semibold small">{user.name}</div>
                  <div className="text-white-50 text-uppercase" style={{ fontSize: "0.7rem" }}>
                    {user.role}
                  </div>
                </div>

                {user.role === "teacher" && (
                  <div className="btn-group btn-group-sm">
                    <button
                      className={`btn ${
                        view === "home" || view === "teacherDashboard"
                          ? "btn-light text-primary fw-bold"
                          : "btn-outline-light"
                      }`}
                      onClick={() => {
                        setMessage("");
                        setView("home");
                        loadTeacherDashboard();
                      }}
                    >
                      📊 Dashboard
                    </button>
                    <button
                      className={`btn ${
                        view === "enrolledStudents"
                          ? "btn-light text-primary fw-bold"
                          : "btn-outline-light"
                      }`}
                      onClick={() => {
                        setMessage("");
                        setView("enrolledStudents");
                        loadTeacherDashboard();
                      }}
                    >
                      👥 Enrolled Students
                    </button>
                    <button
                      className={`btn ${
                        view === "teacherExams"
                          ? "btn-light text-primary fw-bold"
                          : "btn-outline-light"
                      }`}
                      onClick={() => {
                        setMessage("");
                        setView("teacherExams");
                        loadTeacherExams();
                      }}
                    >
                      📁 My Exams
                    </button>
                    <button
                      className={`btn ${
                        view === "chat"
                          ? "btn-light text-primary fw-bold"
                          : "btn-outline-light"
                      }`}
                      onClick={() => {
                        setMessage("");
                        setView("chat");
                        loadChat();
                      }}
                    >
                      💬 Chat & Doubts
                    </button>
                    <button
                      className={`btn ${
                        view === "createExam"
                          ? "btn-light text-primary fw-bold"
                          : "btn-outline-light"
                      }`}
                      onClick={() => {
                        setMessage("");
                        setView("createExam");
                      }}
                    >
                      + Create
                    </button>
                  </div>
                )}

                {user.role === "student" && (
                  <div className="btn-group btn-group-sm">
                    <button
                      className={`btn ${
                        view === "home"
                          ? "btn-light text-primary fw-bold"
                          : "btn-outline-light"
                      }`}
                      onClick={goHome}
                    >
                      Exams
                    </button>
                    <button
                      className={`btn position-relative ${
                        view === "reminders"
                          ? "btn-light text-primary fw-bold"
                          : "btn-outline-light"
                      }`}
                      onClick={() => {
                        setMessage("");
                        setView("reminders");
                        loadReminders();
                      }}
                    >
                      ⏰ Reminders
                      {pendingReminders.pendingCount > 0 && (
                        <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                          {pendingReminders.pendingCount}
                        </span>
                      )}
                    </button>
                    <button
                      className={`btn ${
                        view === "myResults"
                          ? "btn-light text-primary fw-bold"
                          : "btn-outline-light"
                      }`}
                      onClick={() => {
                        setMessage("");
                        setView("myResults");
                        loadMyResults();
                      }}
                    >
                      🏆 My Results
                    </button>
                    <button
                      className={`btn ${
                        view === "chat"
                          ? "btn-light text-primary fw-bold"
                          : "btn-outline-light"
                      }`}
                      onClick={() => {
                        setMessage("");
                        setView("chat");
                        loadChat();
                      }}
                    >
                      💬 Doubts Chat
                    </button>
                  </div>
                )}

                <button
                  className="btn btn-outline-light btn-sm ms-1"
                  onClick={logout}
                >
                  Logout
                </button>
              </>
            ) : (
              <span className="text-white-50 small">University Examination Portal</span>
            )}
          </div>
        </div>
      </nav>

      <main className="container py-4 flex-grow-1">
        {/* Flash Message Banner */}
        {message && (
          <div
            className="alert alert-info alert-dismissible fade show shadow-sm mb-4"
            role="alert"
            aria-live="polite"
          >
            <div className="d-flex align-items-center justify-content-between">
              <span>{message}</span>
              <button
                type="button"
                className="btn-close"
                onClick={() => setMessage("")}
                aria-label="Close"
              ></button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* REDESIGNED MODERN LOGIN & REGISTRATION HERO VIEW     */}
        {/* ==================================================== */}
        {!user && (
          <div className="row justify-content-center align-items-center py-4">
            <div className="col-xl-10 col-lg-11">
              <div className="card border-0 shadow-lg overflow-hidden" style={{ borderRadius: "20px" }}>
                <div className="row g-0">
                  {/* Left Hero Brand Panel */}
                  <div className="col-lg-5 auth-hero-card d-flex flex-column justify-content-between">
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-3">
                        <span className="fs-1">🎓</span>
                        <h2 className="text-white fw-bold mb-0">EduNexa</h2>
                      </div>
                      <p className="text-light opacity-90 fs-6 mb-4">
                        State-of-the-art cloud assessment & student performance intelligence platform.
                      </p>

                      <div className="d-flex flex-column gap-3 mb-4">
                        <div className="auth-pill-feature">
                          <span>🛡️</span>
                          <span>Role-Based Secure Exam Architecture</span>
                        </div>
                        <div className="auth-pill-feature">
                          <span>⚡</span>
                          <span>Server-Side Evaluated Real-Time Scoring</span>
                        </div>
                        <div className="auth-pill-feature">
                          <span>📊</span>
                          <span>Personalized Rule-Based Study Analytics</span>
                        </div>
                        <div className="auth-pill-feature">
                          <span>💬</span>
                          <span>Integrated Student-Teacher Doubt Chat</span>
                        </div>
                        <div className="auth-pill-feature">
                          <span>⏰</span>
                          <span>Automated Submission & Exam Reminders</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-top border-white border-opacity-20 text-white-50 small">
                      © 2026 EduNexa • Standardized College Examination Suite
                    </div>
                  </div>

                  {/* Right Form Panel */}
                  <div className="col-lg-7 p-4 p-md-5 bg-white">
                    <div className="mx-auto" style={{ maxWidth: 440 }}>
                      <div className="text-center mb-4">
                        <h3 className="fw-bold text-dark mb-1">
                          {mode === "register" ? "Create an Account" : "Welcome Back"}
                        </h3>
                        <p className="text-secondary small">
                          {mode === "register"
                            ? "Register to begin testing or managing assessments"
                            : "Enter your credentials to access your EduNexa portal"}
                        </p>
                      </div>

                      {/* Interactive Role Switcher Cards */}
                      <div className="row g-2 mb-4">
                        <div className="col-6">
                          <div
                            className={`auth-role-card ${role === "student" ? "active" : ""}`}
                            onClick={() => {
                              setRole("student");
                              setMessage("");
                            }}
                          >
                            <div className="fs-3 mb-1">🎓</div>
                            <div className="fw-bold small text-dark">Student Portal</div>
                            <div className="text-secondary" style={{ fontSize: "0.725rem" }}>
                              Take exams & track grades
                            </div>
                          </div>
                        </div>

                        <div className="col-6">
                          <div
                            className={`auth-role-card ${role === "teacher" ? "active" : ""}`}
                            onClick={() => {
                              setRole("teacher");
                              setMessage("");
                            }}
                          >
                            <div className="fs-3 mb-1">👨‍🏫</div>
                            <div className="fw-bold small text-dark">Teacher Portal</div>
                            <div className="text-secondary" style={{ fontSize: "0.725rem" }}>
                              Author exams & view results
                            </div>
                          </div>
                        </div>
                      </div>

                      <form onSubmit={handleAuth}>
                        {mode === "register" && (
                          <div className="mb-3">
                            <label className="form-label small fw-semibold text-dark">
                              Full Name
                            </label>
                            <div className="input-group">
                              <span className="input-group-text bg-light border-end-0">👤</span>
                              <input
                                className="form-control border-start-0 ps-0"
                                placeholder="e.g. John Doe"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                minLength={2}
                                maxLength={80}
                              />
                            </div>
                          </div>
                        )}

                        <div className="mb-3">
                          <label className="form-label small fw-semibold text-dark">
                            Email Address
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-light border-end-0">✉️</span>
                            <input
                              className="form-control border-start-0 ps-0"
                              type="email"
                              placeholder="e.g. name@university.edu"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="mb-4">
                          <label className="form-label small fw-semibold text-dark">
                            Password
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-light border-end-0">🔒</span>
                            <input
                              className="form-control border-start-0 ps-0"
                              type="password"
                              placeholder="Minimum 8 characters"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              minLength={8}
                            />
                          </div>
                        </div>

                        <button
                          className="btn btn-primary w-100 py-2 fs-6 fw-bold shadow-sm"
                          disabled={loading}
                        >
                          {loading
                            ? "Authenticating..."
                            : mode === "register"
                              ? `Register as ${role === "student" ? "Student" : "Teacher"}`
                              : `Sign In to ${role === "student" ? "Student" : "Teacher"} Portal`}
                        </button>
                      </form>

                      <div className="text-center mt-4 pt-2 border-top">
                        <span className="text-secondary small">
                          {mode === "login"
                            ? "Don't have an account yet? "
                            : "Already registered? "}
                        </span>
                        <button
                          className="btn btn-link p-0 fw-bold text-decoration-none small"
                          onClick={() => {
                            setMode(mode === "login" ? "register" : "login");
                            setMessage("");
                          }}
                        >
                          {mode === "login"
                            ? "Create an Account"
                            : "Sign In instead"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* 1. TEACHER DASHBOARD (STRICT TEACHER EXAM ISOLATION) */}
        {/* ==================================================== */}
        {user &&
          (user.role === "teacher" || user.role === "admin") &&
          (view === "home" || view === "teacherDashboard") && (
            <section className="mb-5">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
                <div>
                  <h2 className="mb-1 fw-bold">Teacher Dashboard</h2>
                  <p className="text-secondary mb-0">
                    Showing statistics and student attempts for exams created by <strong>{user.name}</strong>.
                  </p>
                </div>

                <div className="d-flex gap-2">
                  <button
                    className="btn btn-outline-primary btn-sm"
                    onClick={loadTeacherDashboard}
                    disabled={loading}
                  >
                    🔄 Refresh Data
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setMessage("");
                      setView("createExam");
                    }}
                  >
                    + Create Exam
                  </button>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={async () => {
                      setMessage("");
                      await loadTeacherExams();
                      setView("teacherExams");
                    }}
                  >
                    Manage My Exams
                  </button>
                </div>
              </div>

              {loading && !teacherStats ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading dashboard...</span>
                  </div>
                  <p className="text-secondary mt-2">Loading performance statistics...</p>
                </div>
              ) : (
                <>
                  {/* Top Metric Cards */}
                  <div className="row g-3 mb-4">
                    <div className="col-xl-2 col-md-4 col-sm-6">
                      <div className="stat-card h-100">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="stat-label">Enrolled Students</span>
                          <span className="stat-icon bg-primary bg-opacity-10 text-primary">
                            👥
                          </span>
                        </div>
                        <div className="stat-value">
                          {teacherStats?.totalStudents ?? 0}
                        </div>
                        <small className="text-muted">Total platform learners</small>
                      </div>
                    </div>

                    <div className="col-xl-2 col-md-4 col-sm-6">
                      <div className="stat-card h-100">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="stat-label">My Exams</span>
                          <span className="stat-icon bg-info bg-opacity-10 text-info">
                            📝
                          </span>
                        </div>
                        <div className="stat-value">
                          {teacherStats?.totalExams ?? 0}
                        </div>
                        <small className="text-muted">
                          {teacherStats?.publishedExams ?? 0} published by you
                        </small>
                      </div>
                    </div>

                    <div className="col-xl-3 col-md-4 col-sm-6">
                      <div className="stat-card h-100">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="stat-label">Completed Attempts</span>
                          <span className="stat-icon bg-success bg-opacity-10 text-success">
                            ✅
                          </span>
                        </div>
                        <div className="stat-value">
                          {teacherStats?.completedAttempts ?? 0}
                        </div>
                        <small className="text-muted">On your created exams</small>
                      </div>
                    </div>

                    <div className="col-xl-2 col-md-6 col-sm-6">
                      <div className="stat-card h-100">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="stat-label">Average Marks</span>
                          <span className="stat-icon bg-warning bg-opacity-10 text-warning">
                            🎯
                          </span>
                        </div>
                        <div className="stat-value">
                          {teacherStats?.averagePercentage ?? 0}%
                        </div>
                        <small className="text-muted">
                          Avg: {teacherStats?.averageMarks ?? 0} pts
                        </small>
                      </div>
                    </div>

                    <div className="col-xl-3 col-md-6 col-sm-12">
                      <div className="stat-card h-100">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="stat-label">Pass Percentage</span>
                          <span className="stat-icon bg-danger bg-opacity-10 text-danger">
                            📈
                          </span>
                        </div>
                        <div className="stat-value">
                          {teacherStats?.passPercentage ?? 0}%
                        </div>
                        <small className="text-muted">Pass rate (≥ 50% score)</small>
                      </div>
                    </div>
                  </div>

                  {/* Empty State when teacher has 0 exams */}
                  {teacherStats?.totalExams === 0 && (
                    <div className="alert alert-warning border d-flex justify-content-between align-items-center mb-4">
                      <div>
                        <strong>Notice:</strong> You haven't created any exams yet under this teacher account. Click <strong>"+ Create Exam"</strong> to author and publish assessments for students.
                      </div>
                      <button
                        className="btn btn-warning btn-sm fw-bold ms-3"
                        onClick={() => setView("createExam")}
                      >
                        Create Your First Exam
                      </button>
                    </div>
                  )}

                  {/* Visual Performance Charts */}
                  <div className="row g-4 mb-4">
                    <div className="col-lg-6">
                      <div className="chart-container h-100">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <h5 className="mb-0 fw-bold">Student Performance Breakdown</h5>
                          <span className="badge bg-light text-secondary border">
                            {teacherStudents.length} Students
                          </span>
                        </div>
                        <p className="text-secondary small mb-3">
                          Score distribution of students on your examinations.
                        </p>

                        {chartData?.distribution && chartData.distribution.length > 0 ? (
                          <div className="d-flex flex-column gap-3">
                            {chartData.distribution.map((item, idx) => {
                              const total = teacherStudents.length || 1;
                              const pct = Math.round((item.count / total) * 100);
                              return (
                                <div key={idx}>
                                  <div className="d-flex justify-content-between small fw-semibold mb-1">
                                    <span>{item.label}</span>
                                    <span>
                                      {item.count} ({pct}%)
                                    </span>
                                  </div>
                                  <div className="chart-bar-bg">
                                    <div
                                      className="chart-bar-fill"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: item.color,
                                        minWidth: item.count > 0 ? "24px" : "0",
                                      }}
                                    >
                                      {item.count > 0 && `${item.count}`}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-muted small">No performance data recorded yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="col-lg-6">
                      <div className="chart-container h-100">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <h5 className="mb-0 fw-bold">My Exams Pass Rates</h5>
                          <span className="badge bg-light text-secondary border">
                            {chartData?.examBreakdown?.length || 0} Exams
                          </span>
                        </div>
                        <p className="text-secondary small mb-3">
                          Pass rate and average score comparison for exams authored by you.
                        </p>

                        {chartData?.examBreakdown && chartData.examBreakdown.length > 0 ? (
                          <div
                            className="d-flex flex-column gap-3 overflow-auto"
                            style={{ maxHeight: 280 }}
                          >
                            {chartData.examBreakdown.map((ex, idx) => (
                              <div
                                key={idx}
                                className="border rounded-3 p-2 bg-light bg-opacity-50"
                              >
                                <div className="d-flex justify-content-between align-items-center mb-1">
                                  <span className="fw-semibold text-truncate" style={{ maxWidth: 220 }}>
                                    {ex.title}
                                  </span>
                                  <div className="d-flex gap-2 small">
                                    <span className="badge bg-primary">
                                      Avg: {ex.averagePercentage}%
                                    </span>
                                    <span
                                      className={`badge ${
                                        ex.passRate >= 70
                                          ? "bg-success"
                                          : ex.passRate >= 50
                                            ? "bg-warning text-dark"
                                            : "bg-danger"
                                      }`}
                                    >
                                      Pass: {ex.passRate}%
                                    </span>
                                  </div>
                                </div>

                                <div className="progress" style={{ height: 8 }}>
                                  <div
                                    className="progress-bar bg-primary"
                                    role="progressbar"
                                    style={{ width: `${ex.averagePercentage}%` }}
                                    aria-valuenow={ex.averagePercentage}
                                    aria-valuemin="0"
                                    aria-valuemax="100"
                                  ></div>
                                </div>
                                <div className="d-flex justify-content-between text-muted small mt-1">
                                  <span>{ex.attemptsCount} attempts</span>
                                  <button
                                    className="btn btn-link p-0 text-warning text-decoration-none small"
                                    onClick={() => sendExamReminder(ex._id)}
                                  >
                                    ⏰ Send Reminder
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-muted">
                            No exams authored yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Student Performance Table & Filtering */}
                  <div className="card border-0 shadow-sm rounded-4 mb-4">
                    <div className="card-body p-4">
                      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                        <div>
                          <h4 className="mb-0 fw-bold">Student Exam Results</h4>
                          <small className="text-secondary">
                            Detailed records of students who attempted your exams.
                          </small>
                        </div>
                        <span className="badge bg-light text-primary border">
                          Showing {filteredStudents.length} of {teacherStudents.length} Students
                        </span>
                      </div>

                      {/* Filters and Search Bar */}
                      <div className="row g-2 mb-4 bg-light p-3 rounded-3 border">
                        <div className="col-md-5">
                          <label className="form-label small fw-semibold text-secondary mb-1">
                            Search Student
                          </label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search by student name or email..."
                            value={studentSearch}
                            onChange={(e) => setStudentSearch(e.target.value)}
                          />
                        </div>

                        <div className="col-md-3">
                          <label className="form-label small fw-semibold text-secondary mb-1">
                            Filter by My Exam
                          </label>
                          <select
                            className="form-select form-select-sm"
                            value={selectedExamFilter}
                            onChange={(e) => setSelectedExamFilter(e.target.value)}
                          >
                            <option value="all">All My Exams</option>
                            {teacherExamsList.map((exam) => (
                              <option key={exam._id} value={exam._id}>
                                {exam.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-md-3">
                          <label className="form-label small fw-semibold text-secondary mb-1">
                            Filter by Status
                          </label>
                          <select
                            className="form-select form-select-sm"
                            value={selectedPerformanceFilter}
                            onChange={(e) =>
                              setSelectedPerformanceFilter(e.target.value)
                            }
                          >
                            <option value="all">All Statuses</option>
                            <option value="Excellent">Excellent (≥80%)</option>
                            <option value="Good">Good (65-79%)</option>
                            <option value="Average">Average (50-64%)</option>
                            <option value="Needs Improvement">
                              Needs Improvement (&lt;50%)
                            </option>
                            <option value="Not Attempted">Not Attempted</option>
                          </select>
                        </div>

                        <div className="col-md-1 d-flex align-items-end">
                          <button
                            className="btn btn-outline-secondary btn-sm w-100"
                            onClick={() => {
                              setStudentSearch("");
                              setSelectedExamFilter("all");
                              setSelectedPerformanceFilter("all");
                            }}
                            title="Reset all filters"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      {/* Students Table */}
                      {filteredStudents.length === 0 ? (
                        <div className="text-center py-5 border rounded-3 bg-light">
                          <div className="fs-1 mb-2">🔍</div>
                          <h6 className="fw-bold">No student records match your filter</h6>
                          <p className="text-secondary small mb-3">
                            Try adjusting your filter settings or clear search terms.
                          </p>
                        </div>
                      ) : (
                        <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>Student</th>
                                <th>Email Address</th>
                                <th className="text-center">Exams Attempted</th>
                                <th className="text-center">Marks Obtained</th>
                                <th className="text-center">Overall %</th>
                                <th className="text-center">Grade</th>
                                <th className="text-center">Performance Status</th>
                                <th className="text-end">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredStudents.map((st) => {
                                const isExpanded = expandedStudentId === st._id;
                                return (
                                  <tr key={st._id}>
                                    <td>
                                      <div className="fw-semibold text-dark">
                                        {st.name}
                                      </div>
                                    </td>
                                    <td>
                                      <span className="text-secondary small">
                                        {st.email}
                                      </span>
                                    </td>
                                    <td className="text-center">
                                      <span className="badge bg-light text-dark border">
                                        {st.examsAttempted}
                                      </span>
                                    </td>
                                    <td className="text-center">
                                      {st.examsAttempted > 0 ? (
                                        <span className="fw-semibold">
                                          {st.totalScore} / {st.totalMarks}
                                        </span>
                                      ) : (
                                        <span className="text-muted">—</span>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      {st.percentage !== null ? (
                                        <span className="fw-bold">
                                          {st.percentage}%
                                        </span>
                                      ) : (
                                        <span className="text-muted">—</span>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      <span className="badge bg-secondary bg-opacity-25 text-dark fw-bold">
                                        {st.grade}
                                      </span>
                                    </td>
                                    <td className="text-center">
                                      <span
                                        className={`badge-status ${getBadgeClass(
                                          st.performanceStatus
                                        )}`}
                                      >
                                        {st.performanceStatus}
                                      </span>
                                    </td>
                                    <td className="text-end">
                                      {st.examsAttempted > 0 ? (
                                        <button
                                          className="btn btn-outline-primary btn-sm py-0 px-2"
                                          onClick={() =>
                                            setExpandedStudentId(
                                              isExpanded ? null : st._id
                                            )
                                          }
                                        >
                                          {isExpanded ? "Hide" : "View"} ({st.examsAttempted})
                                        </button>
                                      ) : (
                                        <span className="text-muted small">None</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Expandable Attempt Breakdown Details */}
                      {expandedStudentId && (
                        <div className="mt-4 p-3 bg-light rounded-3 border">
                          {(() => {
                            const target = teacherStudents.find(
                              (s) => s._id === expandedStudentId
                            );
                            if (!target) return null;
                            return (
                              <div>
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                  <h6 className="fw-bold mb-0 text-primary">
                                    Assessment Details for {target.name} ({target.email})
                                  </h6>
                                  <button
                                    className="btn btn-sm btn-outline-secondary py-0"
                                    onClick={() => setExpandedStudentId(null)}
                                  >
                                    Close Details
                                  </button>
                                </div>

                                <div className="table-responsive">
                                  <table className="table table-sm table-bordered bg-white mb-0">
                                    <thead className="table-light">
                                      <tr>
                                        <th>Exam Title</th>
                                        <th className="text-center">Score</th>
                                        <th className="text-center">Percentage</th>
                                        <th className="text-center">Grade</th>
                                        <th className="text-center">Submitted At</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {target.attempts.map((att) => (
                                        <tr key={att._id}>
                                          <td className="fw-medium">{att.examTitle}</td>
                                          <td className="text-center">
                                            {att.score} / {att.totalMarks}
                                          </td>
                                          <td className="text-center fw-semibold">
                                            {att.percentage}%
                                          </td>
                                          <td className="text-center">
                                            <span className="badge bg-light text-dark border">
                                              {att.grade}
                                            </span>
                                          </td>
                                          <td className="text-center small text-secondary">
                                            {att.submittedAt
                                              ? new Date(att.submittedAt).toLocaleString()
                                              : "N/A"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

        {/* ==================================================== */}
        {/* 2. ENROLLED STUDENTS COMPLETE DATA DIRECTORY         */}
        {/* ==================================================== */}
        {user?.role === "teacher" && view === "enrolledStudents" && (
          <section className="mb-5">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
              <div>
                <h2 className="mb-1 fw-bold">Enrolled Students Directory</h2>
                <p className="text-secondary mb-0">
                  Complete roster of registered learners, account info, and quick communication actions.
                </p>
              </div>

              <div className="d-flex gap-2">
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={goHome}
                >
                  Back to Dashboard
                </button>
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4">
              <div className="card-body p-4">
                <div className="row g-2 mb-4">
                  <div className="col-md-6">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Search enrolled students by name or email..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Student</th>
                        <th>Email Address</th>
                        <th className="text-center">Enrolled / Joined</th>
                        <th className="text-center">My Exams Taken</th>
                        <th className="text-center">Performance Status</th>
                        <th className="text-end">Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((st) => (
                        <tr key={st._id}>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <div className="student-avatar">
                                {st.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="fw-semibold text-dark">{st.name}</div>
                            </div>
                          </td>
                          <td className="text-secondary small">{st.email}</td>
                          <td className="text-center text-muted small">
                            {st.createdAt ? new Date(st.createdAt).toLocaleDateString() : "Active"}
                          </td>
                          <td className="text-center">
                            <span className="badge bg-light text-dark border">
                              {st.examsAttempted}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={`badge-status ${getBadgeClass(st.performanceStatus)}`}>
                              {st.performanceStatus}
                            </span>
                          </td>
                          <td className="text-end">
                            <button
                              className="btn btn-outline-primary btn-sm me-1 py-0 px-2"
                              onClick={() => {
                                setSelectedContact({ _id: st._id, name: st.name });
                                setView("chat");
                                loadChat(st._id);
                              }}
                              title="Message student"
                            >
                              💬 Chat
                            </button>
                            {teacherExamsList.length > 0 && (
                              <button
                                className="btn btn-outline-warning btn-sm py-0 px-2 text-dark"
                                onClick={() => sendExamReminder(teacherExamsList[0]._id, st._id)}
                                title="Send exam reminder"
                              >
                                ⏰ Remind
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* 3. CHAT & DOUBTS SECTION (STUDENT & TEACHER)         */}
        {/* ==================================================== */}
        {user && view === "chat" && (
          <section className="mb-5">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
              <div>
                <h2 className="mb-1 fw-bold">
                  {user.role === "teacher" ? "Student Communication & Doubts" : "Doubt Clearance & Instructor Chat"}
                </h2>
                <p className="text-secondary mb-0">
                  Ask questions, resolve conceptual doubts, and receive real-time teacher feedback.
                </p>
              </div>

              <div className="d-flex gap-2">
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => loadChat(selectedContact?._id)}
                >
                  🔄 Refresh Chat
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={goHome}>
                  Back to Dashboard
                </button>
              </div>
            </div>

            <div className="row g-3">
              {/* Contacts Sidebar */}
              <div className="col-lg-4">
                <div className="card border-0 shadow-sm rounded-4 h-100">
                  <div className="card-header bg-white py-3 border-bottom">
                    <h6 className="mb-0 fw-bold">
                      {user.role === "teacher" ? "Direct Student Chats" : "Select Your Instructor / Teacher"}
                    </h6>
                    <small className="text-muted" style={{ fontSize: "0.75rem" }}>
                      {user.role === "teacher"
                        ? "Private 1-on-1 conversations with enrolled students"
                        : "Private 1-on-1 doubts sent directly to that teacher"}
                    </small>
                  </div>

                  <div className="list-group list-group-flush overflow-auto" style={{ maxHeight: 480 }}>
                    {contacts.length === 0 ? (
                      <div className="p-4 text-center text-muted small">
                        {user.role === "teacher" ? "No enrolled students registered yet." : "No instructors available."}
                      </div>
                    ) : (
                      contacts.map((contact) => (
                        <button
                          key={contact._id}
                          className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${
                            selectedContact?._id === contact._id ? "active" : ""
                          }`}
                          onClick={() => {
                            setSelectedContact(contact);
                            loadChat(contact._id);
                          }}
                        >
                          <div className="student-avatar" style={{ width: 34, height: 34 }}>
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="text-truncate">
                            <div className="fw-bold small">{contact.name}</div>
                            <div className="small opacity-75 text-truncate" style={{ fontSize: "0.75rem" }}>
                              {contact.email}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Chat Message Window */}
              <div className="col-lg-8">
                <div className="chat-window">
                  {/* Chat Header */}
                  <div className="p-3 bg-white border-bottom d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <span className="fs-5">🔒</span>
                      <div>
                        <h6 className="mb-0 fw-bold">
                          {selectedContact ? `Private Chat with ${selectedContact.name}` : "Select a recipient"}
                        </h6>
                        <small className="text-muted">
                          {selectedContact
                            ? `Private 1-on-1 channel • Only you and ${selectedContact.name} can view these messages`
                            : "Choose a contact from the left panel to begin private chat"}
                        </small>
                      </div>
                    </div>
                  </div>

                  {/* Messages Stream */}
                  <div className="chat-messages-container">
                    {messages.length === 0 ? (
                      <div className="text-center py-5 text-muted my-auto">
                        <div className="fs-1 mb-2">💬</div>
                        <p className="mb-1">
                          {selectedContact
                            ? `No prior messages between you and ${selectedContact.name}.`
                            : "No conversation selected."}
                        </p>
                        <small>Type your question below to start this private conversation.</small>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isSentByMe = msg.sender === user.id || msg.sender?._id === user.id;

                        if (msg.isReminder) {
                          return (
                            <div key={msg._id} className="chat-bubble-reminder">
                              <div className="fw-bold small mb-1">
                                ⏰ {msg.senderName} ({msg.senderRole}):
                              </div>
                              <div className="small">{msg.text}</div>
                              <div className="chat-meta text-muted">
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={msg._id}
                            className={`chat-bubble ${isSentByMe ? "chat-bubble-sent" : "chat-bubble-received"}`}
                          >
                            <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
                              <span className="fw-bold small" style={{ fontSize: "0.78rem" }}>
                                {isSentByMe ? "You" : msg.senderName} ({msg.senderRole})
                              </span>
                              {msg.examTitle && (
                                <span className="badge bg-light text-dark border" style={{ fontSize: "0.68rem" }}>
                                  Exam: {msg.examTitle}
                                </span>
                              )}
                            </div>
                            <div>{msg.text}</div>
                            <div className={`chat-meta ${isSentByMe ? "text-light" : "text-muted"} text-end`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Message Input Box */}
                  <div className="p-3 bg-white border-top">
                    <form onSubmit={sendChatMessage}>
                      <div className="row g-2 mb-2">
                        {teacherExamsList.length > 0 && (
                          <div className="col-md-5">
                            <select
                              className="form-select form-select-sm"
                              value={chatExamId}
                              onChange={(e) => setChatExamId(e.target.value)}
                            >
                              <option value="">Tag Exam (Optional)</option>
                              {teacherExamsList.map((ex) => (
                                <option key={ex._id} value={ex._id}>
                                  {ex.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="input-group">
                        <input
                          type="text"
                          className="form-control"
                          disabled={!selectedContact}
                          placeholder={
                            !selectedContact
                              ? "Select a recipient from the list to start messaging..."
                              : user.role === "student"
                                ? `Send private message/doubt to ${selectedContact.name}...`
                                : `Reply privately to ${selectedContact.name}...`
                          }
                          value={chatText}
                          onChange={(e) => setChatText(e.target.value)}
                        />
                        <button
                          className="btn btn-primary px-4 fw-bold"
                          type="submit"
                          disabled={!selectedContact || !chatText.trim()}
                        >
                          Send ✈️
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* 4. STUDENT: EXAM REMINDERS VIEW                      */}
        {/* ==================================================== */}
        {user?.role === "student" && view === "reminders" && (
          <section className="mb-5">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
              <div>
                <h2 className="mb-1 fw-bold">Active Exam Reminders</h2>
                <p className="text-secondary mb-0">
                  Stay on track! Review pending published exams and instructor announcements.
                </p>
              </div>

              <div className="d-flex gap-2">
                <button className="btn btn-outline-primary btn-sm" onClick={loadReminders}>
                  🔄 Refresh Reminders
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={goHome}>
                  Available Exams
                </button>
              </div>
            </div>

            {/* Pending Exams Reminders */}
            <h5 className="fw-bold mb-3 text-primary">Pending Assessments Requiring Your Submission</h5>

            {pendingReminders.pendingExams.length === 0 ? (
              <div className="card border-0 shadow-sm rounded-4 p-4 text-center mb-4 bg-white">
                <div className="fs-1 mb-2">🎉</div>
                <h5 className="fw-bold text-success">All Caught Up!</h5>
                <p className="text-secondary mb-0">
                  You have completed all published examinations. Great job!
                </p>
              </div>
            ) : (
              <div className="row g-3 mb-4">
                {pendingReminders.pendingExams.map((exam) => (
                  <div className="col-md-6" key={exam._id}>
                    <div className="reminder-card h-100 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <h5 className="fw-bold text-dark mb-0">{exam.title}</h5>
                          <span className="badge bg-warning text-dark">Pending</span>
                        </div>
                        <p className="text-secondary small mb-3">
                          {exam.description || "Assessment is live. Make sure to complete before the test concludes."}
                        </p>
                        <div className="small text-muted mb-3">
                          ⏱️ Duration: <strong>{exam.durationMinutes} minutes</strong> • {exam.questionsCount} questions
                        </div>
                      </div>

                      <button
                        className="btn btn-primary w-100 py-2 fw-bold"
                        onClick={() => openExam(exam._id)}
                      >
                        Start Exam Now 🚀
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Teacher Announcements / Reminders Feed */}
            <h5 className="fw-bold mb-3 text-primary">Instructor Reminder Broadcasts</h5>
            {pendingReminders.reminderMessages.length === 0 ? (
              <p className="text-muted small">No instructor broadcasts at this time.</p>
            ) : (
              <div className="d-flex flex-column gap-2">
                {pendingReminders.reminderMessages.map((rem) => (
                  <div key={rem._id} className="card border-0 shadow-sm p-3 bg-white">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-bold text-dark">
                        👨‍🏫 {rem.senderName} ({rem.senderRole})
                      </span>
                      <small className="text-muted">
                        {new Date(rem.createdAt).toLocaleString()}
                      </small>
                    </div>
                    <div className="text-secondary">{rem.text}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ==================================================== */}
        {/* 5. STUDENT HOME: AVAILABLE EXAMS                     */}
        {/* ==================================================== */}
        {user && user.role === "student" && view === "home" && (
          <section className="mb-5">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
              <div>
                <h2 className="mb-1 fw-bold">Available Exams</h2>
                <p className="text-secondary mb-0">
                  Select an examination to begin. The exam will run with strict server evaluation.
                </p>
              </div>

              <div className="d-flex gap-2">
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={loadExams}
                  disabled={loading}
                >
                  🔄 Refresh
                </button>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={async () => {
                    setMessage("");
                    await loadMyResults();
                    setView("myResults");
                  }}
                >
                  My Results & Study Suggestions
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading exams...</span>
                </div>
                <p className="text-secondary mt-2">Loading available exams...</p>
              </div>
            ) : exams.length === 0 ? (
              <div className="card border-0 shadow-sm rounded-4 p-5 text-center">
                <div className="display-6 mb-3">📋</div>
                <h5 className="fw-bold">No published exams currently available</h5>
                <p className="text-secondary mb-0">
                  Your instructors haven't published any exams yet. Please check back shortly.
                </p>
              </div>
            ) : (
              <div className="row g-4">
                {exams.map((exam) => (
                  <div className="col-md-6 col-lg-4" key={exam._id}>
                    <div className="card h-100 border-0 shadow-sm rounded-4 d-flex flex-column">
                      <div className="card-body p-4 d-flex flex-column">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <h5 className="card-title fw-bold text-primary mb-0">
                            {exam.title}
                          </h5>
                          <span className="badge bg-light text-secondary border">
                            ⏱️ {exam.durationMinutes} min
                          </span>
                        </div>

                        <p className="text-secondary small flex-grow-1">
                          {exam.description || "No specific instructions provided."}
                        </p>

                        <div className="pt-3 border-top mt-auto">
                          <div className="d-flex justify-content-between align-items-center mb-3 text-secondary small">
                            <span>Questions: {exam.questions?.length ?? 0}</span>
                            <span>Total Marks: {exam.questions?.reduce((s, q) => s + (q.marks || 1), 0) ?? 0}</span>
                          </div>

                          <button
                            className="btn btn-primary w-100 py-2 fw-semibold"
                            onClick={() => openExam(exam._id)}
                            disabled={loading}
                          >
                            Start Exam
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ==================================================== */}
        {/* 6. STUDENT MARKS, EXAM HISTORY & STUDY SUGGESTIONS   */}
        {/* ==================================================== */}
        {user && user.role === "student" && view === "myResults" && (
          <section className="mb-5">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
              <div>
                <h2 className="mb-1 fw-bold">My Exam Results & Suggestions</h2>
                <p className="text-secondary mb-0">
                  Review your scores, grades, attempt history, and personalized study suggestions.
                </p>
              </div>

              <div className="d-flex gap-2">
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={loadMyResults}
                  disabled={loading}
                >
                  🔄 Refresh Results
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={goHome}>
                  Back to Exams
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading results...</span>
                </div>
                <p className="text-secondary mt-2">Loading your assessment results...</p>
              </div>
            ) : (
              <>
                {/* Rule-Based Study Improvement Suggestions Card */}
                {suggestions && (
                  <div className="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
                    <div
                      className="p-3 text-white d-flex align-items-center justify-content-between flex-wrap gap-2"
                      style={{ backgroundColor: "#17365d" }}
                    >
                      <div className="d-flex align-items-center gap-2">
                        <span className="fs-4">💡</span>
                        <h5 className="mb-0 fw-bold">
                          Personalized Study Improvement Suggestions
                        </h5>
                      </div>
                      <span className="badge bg-light text-primary fw-bold">
                        Tier: {suggestions.scoreTier || "General"}
                      </span>
                    </div>

                    <div className="card-body p-4">
                      {/* Overall Diagnostic Summary */}
                      <div className="suggestion-box mb-4">
                        <div className="d-flex align-items-start gap-2">
                          <div>
                            <h6 className="fw-bold mb-1 text-primary">Performance Evaluation</h6>
                            <p className="mb-0 text-dark">{suggestions.summary}</p>
                          </div>
                        </div>
                      </div>

                      {/* Performance Trend across Attempts */}
                      <div className="mb-4 p-3 bg-light rounded-3 border">
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <span className="fw-bold text-secondary">
                            {suggestions.trendDirection === "up"
                              ? "📈"
                              : suggestions.trendDirection === "down"
                                ? "📉"
                                : "📊"}{" "}
                            Performance Trend
                          </span>
                        </div>
                        <p className="small mb-0 text-dark">{suggestions.trendText}</p>
                      </div>

                      {/* Topic-Level Weaknesses vs. Score-Based Feedback */}
                      {suggestions.hasTopicData ? (
                        <div className="row g-3 mb-4">
                          <div className="col-md-6">
                            <div className="border rounded-3 p-3 h-100 bg-light">
                              <h6 className="fw-bold text-danger mb-2">
                                ⚠️ Recommended Topics to Revise
                              </h6>
                              {suggestions.weakTopics && suggestions.weakTopics.length > 0 ? (
                                <ul className="mb-0 ps-3 small text-dark">
                                  {suggestions.weakTopics.map((item, idx) => (
                                    <li key={idx} className="mb-1">
                                      <strong>{item.topic}</strong>: {item.recommendation}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="small text-muted mb-0">
                                  No critical weak topics identified. You achieved solid scores across all tested areas!
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="col-md-6">
                            <div className="border rounded-3 p-3 h-100 bg-light">
                              <h6 className="fw-bold text-success mb-2">
                                ⭐ Strong / Mastered Topics
                              </h6>
                              {suggestions.strongTopics && suggestions.strongTopics.length > 0 ? (
                                <ul className="mb-0 ps-3 small text-dark">
                                  {suggestions.strongTopics.map((item, idx) => (
                                    <li key={idx} className="mb-1">
                                      <strong>{item.topic}</strong> ({item.accuracy}% accuracy)
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="small text-muted mb-0">
                                  Keep practicing across all modules to build strong topic mastery.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="alert alert-light border mb-4">
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <span className="badge bg-secondary">Topic-level breakdown</span>
                            <small className="text-muted">
                              Specific subject topic tags were not configured for these exam questions. Suggestions are computed directly from verified score benchmarks.
                            </small>
                          </div>
                        </div>
                      )}

                      {/* Actionable Next Steps */}
                      <div>
                        <h6 className="fw-bold text-primary mb-2">
                          🎯 Actionable Next Steps
                        </h6>
                        <div className="row g-2">
                          {suggestions.actionableTips &&
                            suggestions.actionableTips.map((tip, idx) => (
                              <div className="col-md-4" key={idx}>
                                <div className="border rounded-3 p-3 h-100 bg-white">
                                  <div className="d-flex gap-2 align-items-start">
                                    <span className="badge bg-primary rounded-circle">
                                      {idx + 1}
                                    </span>
                                    <span className="small text-dark">{tip}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Exam History Table */}
                <div className="card border-0 shadow-sm rounded-4">
                  <div className="card-body p-4">
                    <h4 className="fw-bold mb-3">Completed Exam History</h4>

                    {myResults.length === 0 ? (
                      <div className="text-center py-5 text-secondary">
                        <div className="display-6 mb-2">📝</div>
                        <p className="mb-3">No exam results recorded yet.</p>
                        <button className="btn btn-primary btn-sm" onClick={goHome}>
                          Take Your First Exam
                        </button>
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Exam Title</th>
                              <th className="text-center">Marks Obtained</th>
                              <th className="text-center">Total Marks</th>
                              <th className="text-center">Percentage</th>
                              <th className="text-center">Grade</th>
                              <th className="text-center">Status</th>
                              <th className="text-end">Submitted Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {myResults.map((res) => (
                              <tr key={res._id}>
                                <td>
                                  <div className="fw-semibold text-primary">
                                    {res.examTitle}
                                  </div>
                                  {res.description && (
                                    <small className="text-muted text-truncate d-inline-block" style={{ maxWidth: 260 }}>
                                      {res.description}
                                    </small>
                                  )}
                                </td>
                                <td className="text-center fw-bold fs-6">
                                  {res.score}
                                </td>
                                <td className="text-center text-muted">
                                  {res.totalMarks}
                                </td>
                                <td className="text-center">
                                  <span className="fw-bold">{res.percentage}%</span>
                                </td>
                                <td className="text-center">
                                  <span className="badge bg-light text-dark border fs-6">
                                    {res.grade}
                                  </span>
                                </td>
                                <td className="text-center">
                                  <span
                                    className={`badge ${
                                      res.status === "Passed"
                                        ? "bg-success"
                                        : "bg-danger"
                                    }`}
                                  >
                                    {res.status}
                                  </span>
                                </td>
                                <td className="text-end small text-secondary">
                                  {res.submittedAt
                                    ? new Date(res.submittedAt).toLocaleString()
                                    : "N/A"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ==================================================== */}
        {/* 7. TEACHER: CREATE EXAM FORM                         */}
        {/* ==================================================== */}
        {user?.role === "teacher" && view === "createExam" && (
          <section className="mb-5">
            <div className="card border-0 shadow-sm rounded-4">
              <div className="card-body p-4 p-md-5">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <div>
                    <h3 className="mb-1 fw-bold">Create a New Exam</h3>
                    <p className="text-secondary mb-0">
                      Author questions, assign marks, and optionally tag topics for student analytics.
                    </p>
                  </div>
                  <button className="btn btn-outline-secondary btn-sm" onClick={goHome}>
                    Cancel
                  </button>
                </div>

                <form onSubmit={createExam}>
                  <div className="row g-3 mb-3">
                    <div className="col-md-8">
                      <label className="form-label fw-semibold">Exam Title</label>
                      <input
                        className="form-control"
                        placeholder="e.g. Midterm Assessment: Computer Networks"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={150}
                        required
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-semibold">
                        Duration (Minutes)
                      </label>
                      <input
                        className="form-control"
                        type="number"
                        min="1"
                        max="300"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="form-label fw-semibold">Description / Guidelines</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      placeholder="Specify exam instructions, topics covered, and guidelines..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={1000}
                    />
                  </div>

                  <h5 className="fw-bold mb-3 border-bottom pb-2">Questions ({questions.length})</h5>

                  {questions.map((question, index) => (
                    <div className="card mb-4 border" key={index}>
                      <div className="card-header bg-light d-flex justify-content-between align-items-center">
                        <span className="fw-bold text-primary">
                          Question {index + 1}
                        </span>

                        {questions.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm py-0"
                            onClick={() => removeQuestion(index)}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="card-body">
                        <div className="row g-2 mb-3">
                          <div className="col-md-8">
                            <label className="form-label small fw-semibold">
                              Question Text
                            </label>
                            <textarea
                              className="form-control"
                              rows="2"
                              placeholder="Enter the question statement..."
                              value={question.text}
                              onChange={(e) =>
                                updateQuestion(index, "text", e.target.value)
                              }
                              maxLength={1000}
                              required
                            />
                          </div>

                          <div className="col-md-4">
                            <label className="form-label small fw-semibold">
                              Topic / Subject Category (Optional)
                            </label>
                            <input
                              className="form-control"
                              placeholder="e.g. Routing, OSI Model, Subnets"
                              value={question.topic || ""}
                              onChange={(e) =>
                                updateQuestion(index, "topic", e.target.value)
                              }
                              maxLength={100}
                            />
                            <small className="text-muted" style={{ fontSize: "0.75rem" }}>
                              Used for personalized weak topic detection.
                            </small>
                          </div>
                        </div>

                        <label className="form-label small fw-semibold">
                          Answer Options
                        </label>
                        {question.options.map((option, optionIndex) => (
                          <div className="input-group mb-2" key={optionIndex}>
                            <span className="input-group-text">
                              {String.fromCharCode(65 + optionIndex)}
                            </span>
                            <input
                              className="form-control"
                              placeholder={`Option ${String.fromCharCode(65 + optionIndex)} text...`}
                              value={option}
                              onChange={(e) =>
                                updateOption(
                                  index,
                                  optionIndex,
                                  e.target.value
                                )
                              }
                              required
                              maxLength={300}
                            />
                          </div>
                        ))}

                        <div className="row g-3 mt-1">
                          <div className="col-md-6">
                            <label className="form-label small fw-semibold">
                              Correct Option
                            </label>
                            <select
                              className="form-select form-select-sm"
                              value={question.correctAnswer}
                              onChange={(e) =>
                                updateQuestion(
                                  index,
                                  "correctAnswer",
                                  Number(e.target.value)
                                )
                              }
                            >
                              {question.options.map((_, optionIndex) => (
                                <option value={optionIndex} key={optionIndex}>
                                  Option {String.fromCharCode(65 + optionIndex)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-md-6">
                            <label className="form-label small fw-semibold">
                              Marks for this Question
                            </label>
                            <input
                              className="form-control form-control-sm"
                              type="number"
                              min="1"
                              max="100"
                              value={question.marks}
                              onChange={(e) =>
                                updateQuestion(
                                  index,
                                  "marks",
                                  Number(e.target.value)
                                )
                              }
                              required
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="d-flex flex-wrap gap-2 justify-content-between pt-2">
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      disabled={questions.length >= 100}
                      onClick={addQuestion}
                    >
                      + Add Another Question
                    </button>

                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={goHome}
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                      >
                        {loading ? "Saving Exam..." : "Save Exam as Draft"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* 8. TEACHER: MANAGE EXAMS VIEW (MY EXAMS ONLY)        */}
        {/* ==================================================== */}
        {user?.role === "teacher" && view === "teacherExams" && (
          <section className="mb-5">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
              <div>
                <h3 className="mb-1 fw-bold">My Author Exam Portfolio</h3>
                <p className="text-secondary mb-0">
                  Manage exams authored by <strong>{user.name}</strong>. Only exams you create are listed and manageable here.
                </p>
              </div>

              <div className="d-flex gap-2">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setView("createExam")}
                >
                  + Create New Exam
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={goHome}>
                  Dashboard
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading exams...</span>
                </div>
              </div>
            ) : exams.length === 0 ? (
              <div className="card border-0 shadow-sm rounded-4 p-5 text-center">
                <div className="fs-1 mb-2">📁</div>
                <h5>No exams authored yet by your account</h5>
                <p className="text-secondary mb-3">
                  Create your first exam draft to begin administering assessments.
                </p>
                <div>
                  <button
                    className="btn btn-primary"
                    onClick={() => setView("createExam")}
                  >
                    Create Exam
                  </button>
                </div>
              </div>
            ) : (
              <div className="row g-3">
                {exams.map((exam) => (
                  <div className="col-md-6" key={exam._id}>
                    <div className="card h-100 border-0 shadow-sm rounded-4">
                      <div className="card-body p-4 d-flex flex-column">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <h5 className="fw-bold mb-0 text-primary">{exam.title}</h5>
                          <span
                            className={`badge ${
                              exam.isPublished
                                ? "bg-success"
                                : "bg-warning text-dark"
                            }`}
                          >
                            {exam.isPublished ? "Published" : "Draft"}
                          </span>
                        </div>

                        <p className="text-secondary small flex-grow-1">
                          {exam.description || "No description provided."}
                        </p>

                        <div className="pt-2 border-top mt-auto d-flex justify-content-between align-items-center flex-wrap gap-2">
                          <span className="small text-muted">
                            {exam.questions?.length ?? 0} Questions • {exam.durationMinutes} mins
                          </span>

                          <div className="d-flex gap-2">
                            {exam.isPublished && (
                              <button
                                className="btn btn-outline-warning btn-sm text-dark"
                                onClick={() => sendExamReminder(exam._id)}
                              >
                                ⏰ Remind
                              </button>
                            )}

                            {!exam.isPublished ? (
                              <button
                                className="btn btn-success btn-sm fw-semibold"
                                onClick={() => publishExam(exam._id)}
                              >
                                Publish Exam
                              </button>
                            ) : (
                              <span className="text-success small fw-semibold align-self-center">
                                ✓ Live
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ==================================================== */}
        {/* 9. STUDENT: TAKE EXAM VIEW                           */}
        {/* ==================================================== */}
        {user?.role === "student" && view === "takeExam" && activeExam && (
          <section className="mb-5">
            <div className="card border-0 shadow-sm rounded-4">
              <div className="card-body p-4 p-md-5">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                  <div>
                    <h3 className="fw-bold mb-1">{activeExam.title}</h3>
                    <p className="text-secondary mb-0">
                      {activeExam.description || "Select the best option for each question."}
                    </p>
                  </div>

                  {/* Countdown Timer */}
                  <div
                    className={`badge p-2 px-3 fs-6 ${
                      timeLeft !== null && timeLeft <= 60
                        ? "bg-danger text-white animate-pulse"
                        : "bg-primary text-white"
                    }`}
                    role="timer"
                    aria-live="polite"
                  >
                    ⏱️ Time Remaining:{" "}
                    <strong>
                      {timeLeft === null
                        ? "Starting..."
                        : `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(
                            timeLeft % 60
                          ).padStart(2, "0")}`}
                    </strong>
                  </div>
                </div>

                <form onSubmit={submitExam}>
                  {(activeExam.questions || []).map((question, index) => (
                    <div className="card mb-4 border" key={question._id}>
                      <div className="card-body p-4">
                        <div className="d-flex justify-content-between align-items-start mb-3">
                          <h5 className="fw-bold mb-0">
                            {index + 1}. {question.text}
                          </h5>
                          <span className="badge bg-light text-secondary border">
                            {question.marks} mark{question.marks > 1 ? "s" : ""}
                          </span>
                        </div>

                        {question.options.map((option, optionIndex) => (
                          <label
                            className="d-flex gap-3 align-items-start p-2 rounded hover-bg border mb-2 cursor-pointer"
                            key={optionIndex}
                            style={{ cursor: "pointer" }}
                          >
                            <input
                              type="radio"
                              className="form-check-input mt-1"
                              name={question._id}
                              value={optionIndex}
                              checked={answers[question._id] === optionIndex}
                              disabled={timeLeft === 0 || loading}
                              onChange={() =>
                                setAnswers((current) => ({
                                  ...current,
                                  [question._id]: optionIndex,
                                }))
                              }
                              required
                            />
                            <span className="fw-medium text-dark">{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="d-flex justify-content-between align-items-center pt-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Exit exam? Your current progress will not be submitted."
                          )
                        ) {
                          goHome();
                        }
                      }}
                    >
                      Exit Exam
                    </button>

                    <button
                      type="submit"
                      className="btn btn-success px-4 py-2 fw-bold"
                      disabled={loading || timeLeft === 0}
                    >
                      {loading
                        ? "Submitting..."
                        : timeLeft === 0
                          ? "Time Over"
                          : "Submit Final Answers"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* 10. RESULT CONFIRMATION VIEW                         */}
        {/* ==================================================== */}
        {view === "result" && result && (
          <section className="row justify-content-center mb-5">
            <div className="col-lg-6 col-md-8">
              <div className="card border-0 shadow-sm rounded-4 text-center p-4 p-md-5">
                <div className="display-4 mb-2">🏆</div>
                <h3 className="fw-bold mb-2">Exam Submitted Successfully!</h3>
                <p className="text-secondary mb-4">
                  Your responses were securely graded by the EduNexa server.
                </p>

                <div className="alert alert-success text-start p-4 mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-secondary fw-semibold">Score Obtained:</span>
                    <strong className="fs-5 text-dark">
                      {result.score} / {result.totalMarks}
                    </strong>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-secondary fw-semibold">Percentage:</span>
                    <strong className="fs-5 text-primary">
                      {Number(result.percentage ?? 0).toFixed(2)}%
                    </strong>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-secondary fw-semibold">Letter Grade:</span>
                    <span className="badge bg-primary fs-6 px-3">
                      {result.grade || calculateGrade(Number(result.percentage ?? 0))}
                    </span>
                  </div>

                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-secondary fw-semibold">Result Status:</span>
                    <span
                      className={`badge fs-6 ${
                        result.status === "Passed" ? "bg-success" : "bg-danger"
                      }`}
                    >
                      {result.status ||
                        (Number(result.percentage ?? 0) >= 50 ? "Passed" : "Failed")}
                    </span>
                  </div>
                </div>

                <div className="d-flex gap-2 justify-content-center">
                  <button
                    className="btn btn-outline-primary"
                    onClick={async () => {
                      setMessage("");
                      await loadMyResults();
                      setView("myResults");
                    }}
                  >
                    View All Results & Suggestions
                  </button>

                  <button className="btn btn-primary" onClick={goHome}>
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-top py-3 mt-auto bg-white">
        <div className="container text-center text-secondary small">
          © 2026 EduNexa – Modern Cloud Examination Platform. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default App;
