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
const cors = require("cors");

const app = express();
app.use(cors());
const port = 5000;

app.use(bodyParser.json());

// Connection to mongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define Kitty Schema
const kittySchema = new mongoose.Schema(
  {
    kittyEmail: { type: String, required: true },
    kittyName: { type: String, required: true },
    kittyDescription: { type: String, required: true },
    kittyType: { type: String, required: true },
    beneficiaryNumber: { type: Number, required: true },
    maturityDate: { type: Date, required: true },
    kittyAddress: { type: String, required: true, unique: true },
    kittyAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Kitty = mongoose.model("Kitty", kittySchema);

// Create Kitty Endpoint
app.post("/createkitty", async (req, res) => {
  try {
    const {
      kittyEmail,
      kittyName,
      kittyDescription,
      kittyType,
      beneficiaryNumber,
      maturityDate,
      kittyAddress,
    } = req.body;

    // Check if kittyAddress already exists
    const existingKitty = await Kitty.findOne({ kittyAddress });
    if (existingKitty) {
      return res.status(400).json({ message: "Kitty address already exists." });
    }

    // Create new kitty entry
    const newKitty = new Kitty({
      kittyEmail,
      kittyName,
      kittyDescription,
      kittyType,
      beneficiaryNumber,
      maturityDate,
      kittyAddress,
    });

    await newKitty.save();
    res
      .status(201)
      .json({ message: "Kitty created successfully!", data: newKitty });
  } catch (error) {
    console.error("Error creating kitty:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// Fetch all Kitties
app.get("/getkitties", async (req, res) => {
  try {
    const kitties = await Kitty.find();
    res.status(200).json(kitties);
  } catch (error) {
    console.error("Error fetching kitties:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// Find kitty by Email
app.get("/getkitties/by-email", async (req, res) => {
  try {
    const { kittyEmail } = req.query;
    if (!kittyEmail) {
      return res.status(400).json({ error: "Kitty email is required." });
    }

    const kitties = await Kitty.find({ kittyEmail }); // FIXED FIELD NAME

    if (kitties.length === 0) {
      return res
        .status(404)
        .json({ message: "No kitties found for this email." });
    }

    res.status(200).json(kitties);
  } catch (error) {
    console.error("Error fetching kitties by email:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

//checking kitty address
app.get("/checkkitty/:kittyAddress", async (req, res) => {
  try {
    const kitty = await Kitty.findOne({
      kittyAddress: req.params.kittyAddress,
    });
    res.json({ exists: !!kitty });
  } catch (error) {
    console.error("Error checking kitty address:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Contribution Schema
const contributionSchema = new mongoose.Schema({
  kittyAddress: String,
  name: String,
  email: String,
  amount: Number,
  transactionRef: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const Contribution = mongoose.model("Contribution", contributionSchema);

// Contribute Endpoint
app.post("/contribute", async (req, res) => {
  try {
    const { kittyAddress, name, email, amount, transactionRef } = req.body;

    // Validate required fields
    if (!kittyAddress || !name || !email || !amount || !transactionRef) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const contribution = new Contribution({
      kittyAddress,
      name,
      email,
      amount,
      transactionRef,
      status: "pending", // Automatically set to pending
    });

    await contribution.save();
    res.status(201).json({ message: "Contribution recorded successfully!" });
  } catch (error) {
    console.error("Error processing contribution:", error);
    res.status(500).json({ error: "Failed to record contribution" });
  }
});

//for individual contributions
app.get("/contribute", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const contributions = await Contribution.find({ email }).sort({
      createdAt: -1,
    });

    res.status(200).json(contributions);
  } catch (error) {
    console.error("Error fetching contributions:", error);
    res.status(500).json({ error: "Failed to fetch contributions." });
  }
});

//for all contributions
app.get("/contributions", async (req, res) => {
  try {
    const contributions = await Contribution.find().sort({ createdAt: -1 });
    res.status(200).json(contributions);
  } catch (error) {
    console.error("Error fetching all contributions:", error);
    res.status(500).json({ error: "Failed to fetch contributions." });
  }
});

// Fetch all contributions for a specific kitty address
app.get("/contributions/by-kitty", async (req, res) => {
  try {
    const { kittyAddress } = req.query;
    if (!kittyAddress) {
      return res.status(400).json({ error: "Kitty address is required." });
    }

    const contributions = await Contribution.find({ kittyAddress }).sort({
      createdAt: -1,
    });

    if (contributions.length === 0) {
      return res
        .status(404)
        .json({ message: "No contributions found for this kitty address." });
    }

    res.status(200).json(contributions);
  } catch (error) {
    console.error("Error fetching contributions by kitty address:", error);
    res.status(500).json({ error: "Failed to fetch contributions." });
  }
});

// Nodemailer for password Reset
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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

// Start Server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
