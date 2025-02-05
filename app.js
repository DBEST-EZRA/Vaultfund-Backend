const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");
const base64 = require("base-64");
const moment = require("moment");
require("dotenv").config();
const { OAuth2Client } = require("google-auth-library");

const app = express();
const port = 3000;

app.use(bodyParser.json());

// Connection to mongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// User Schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  resetToken: String,
  resetTokenExpires: Date,
});
const User = mongoose.model("User", UserSchema);

// Nodemailer for password Reset
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateToken = async () => {
  const auth = base64.encode(
    `${process.env.CONSUMER_KEY}:${process.env.CONSUMER_SECRET}`
  );
  try {
    const response = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error("Error generating token:", error);
    throw error;
  }
};

const stkPush = async (req, res) => {
  const { phone, amount } = req.body;
  const timestamp = moment().format("YYYYMMDDHHmmss");
  const password = base64.encode(
    `${process.env.BUSINESS_SHORT_CODE}${process.env.PASSKEY}${timestamp}`
  );

  try {
    const token = await generateToken();
    const response = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.BUSINESS_SHORT_CODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: process.env.BUSINESS_SHORT_CODE,
        PhoneNumber: phone,
        CallBackURL: process.env.CALLBACK_URL,
        AccountReference: "Beta Designs",
        TransactionDesc: "Development Charges",
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json(response.data);
  } catch (error) {
    console.error("STK Push error:", error);
    res.status(500).json({ error: "STK Push request failed" });
  }
};

app.post("/stkpush", stkPush);

// Signup
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password)
      return res.status(400).json({ error: "Email & password required" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    res.json({ message: "Signup successful" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Password Reset
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 3600000; // 1 hour expiry
    await user.save();

    const resetLink = `http://localhost:3000/reset-password/${resetToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      text: `Click the link to reset your password: ${resetLink}`,
    });

    res.json({ message: "Password reset email sent" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset Password
app.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ error: "Invalid or expired token" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// welcome user on mail
app.post("/mail", (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  const mailOptions = {
    from: "ezradbest101@gmail.com",
    to: email,
    subject: "Welcome to VaultFund",
    text: `Hello ${name},\n\nWelcome to VaultFund! We are excited to have you on board. VaultFund is a group savings management platform that enhances transparency by allowing everyone to track and manage their savings in a seamless and secure way.\n\nWe look forward to your participation!\n\nBest regards,\nThe VaultFund Team`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log("Error: ", error);
      return res.status(500).json({ error: "Failed to send email" });
    }
    console.log("Email sent: " + info.response);
    return res.status(200).json({ message: "Welcome email sent successfully" });
  });
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google Sign-In
app.post("/auth/google", async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { email, name, picture } = ticket.getPayload();

    // Check if user exists in database
    let user = await User.findOne({ email });

    if (!user) {
      // Create a new user if they don't exist
      user = new User({ email, password: null });
      await user.save();
    }

    // Generate JWT for session
    const jwtToken = jwt.sign(
      { userId: user._id, email },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.json({
      message: "Google login successful",
      token: jwtToken,
      user: { email, name, picture },
    });
  } catch (error) {
    console.error("Google authentication error:", error);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// Fetch Users
app.get("/users", async (req, res) => {
  try {
    const users = await User.find(
      {},
      { password: 0, resetToken: 0, resetTokenExpires: 0 }
    ); // Exclude sensitive data
    res.json({ success: true, users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
