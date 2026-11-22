const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth");
const examRoutes = require("./routes/exams");
const chatRoutes = require("./routes/chat");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/chat", chatRoutes);

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "Edunet API is running!",
    status: "success",
    version: "1.0.0",
  });
});

// Health-check route
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "Edunet Backend",
    timestamp: new Date().toISOString(),
  });
});

// Database status route
app.get("/api/db-status", (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  res.status(connected ? 200 : 503).json({
    database: connected ? "connected" : "disconnected",
  });
});

// Start the server after connecting to MongoDB
async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from the .env file");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB Atlas connected successfully.");

    app.listen(PORT, () => {
      console.log(`Edunet API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Edunet:", error.message);
    process.exit(1);
  }
}
startServer();
