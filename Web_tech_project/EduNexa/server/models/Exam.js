const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: (options) =>
        options.length >= 2 &&
        options.length <= 6 &&
        options.every(
          (option) =>
            typeof option === "string" && option.trim().length > 0
        ),
      message: "Provide 2–6 non-empty options.",
    },
  },
  correctAnswer: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function (answer) {
        return Number.isInteger(answer) && answer < this.options.length;
      },
      message: "Correct answer must reference a valid option.",
    },
  },
  marks: {
    type: Number,
    default: 1,
    min: 1,
    max: 100,
  },
  topic: {
    type: String,
    trim: true,
    default: "",
    maxlength: 100,
  },
});

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 300,
    },
    questions: {
      type: [questionSchema],
      required: true,
      validate: {
        validator: (questions) => questions.length > 0,
        message: "An exam must contain at least one question.",
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Exam", examSchema);
