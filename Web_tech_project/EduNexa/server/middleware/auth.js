const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required. Please log in.",
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "cloudexam",
      audience: "cloudexam-users",
    });

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token. Please log in again.",
    });
  }
}

function requireTeacher(req, res, next) {
  if (!req.user || (req.user.role !== "teacher" && req.user.role !== "admin")) {
    return res.status(403).json({
      message: "Teacher access required.",
    });
  }

  next();
}

module.exports = {
  authenticateToken,
  requireTeacher,
};
