const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cron = require("node-cron");
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

    // Send confirmation email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: kittyEmail,
      subject: "Your Kitty Has Been Created - Smart Purse",
      text: `Thank you for using Smart Purse, ${kittyName}!

We are excited to inform you that your kitty has been successfully created.

Here are the details:
- **Kitty Name:** ${kittyName}
- **Kitty Type:** ${kittyType}
- **Description:** ${kittyDescription}
- **Beneficiary Number:** ${beneficiaryNumber}
- **Maturity Date:** ${maturityDate}
- **Kitty Address:** ${kittyAddress}

You can now share your kitty address with contributors to start receiving contributions.

If you have any questions, feel free to contact our support team.

Best regards,  
The Smart Purse Team`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Email sending error:", error);
        return res.status(500).json({
          message: "Kitty created, but failed to send confirmation email.",
        });
      }
      console.log("Email sent: " + info.response);
    });

    res.status(201).json({
      message: "Kitty created successfully!",
      data: newKitty,
    });
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

    // Save contribution in the database
    const contribution = new Contribution({
      kittyAddress,
      name,
      email,
      amount,
      transactionRef,
      status: "pending", // Automatically set to pending
    });

    await contribution.save();

    // Send confirmation email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Contribution Confirmation - Smart Purse",
      text: `Thank you for using Smart Purse, ${name}!

We appreciate your contribution to the kitty with address: ${kittyAddress}.

Here are the details of your transaction:
- Amount Contributed: ${amount}
- Transaction Reference: ${transactionRef}
- Contribution Status: Pending

Your contribution is currently being processed, and you will receive an update once it's confirmed.

If you have any questions, feel free to contact our support team.

Best regards,  
The Smart Purse Team`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Email sending error:", error);
        return res.status(500).json({
          message:
            "Contribution recorded, but failed to send confirmation email.",
        });
      }
      console.log("Email sent: " + info.response);
    });

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

// Schedule Task to Run Every 24 Hours
cron.schedule("0 0 * * *", async () => {
  console.log("Running scheduled contribution summary email task...");

  try {
    const today = moment().startOf("day");

    // Fetch kitties where maturityDate has NOT been reached
    const activeKitties = await Kitty.find({ maturityDate: { $gte: today } });

    for (const kitty of activeKitties) {
      // Get all contributions for this kitty
      const contributions = await Contribution.find({
        kittyAddress: kitty.kittyAddress,
      });

      if (contributions.length === 0) continue; // Skip if no contributions

      // Get unique contributor emails
      const contributorEmails = [...new Set(contributions.map((c) => c.email))];

      // Create Email Table for Contributions
      let tableRows = contributions
        .map(
          (c) => `
          <tr>
            <td>${c.name}</td>
            <td>${c.email}</td>
            <td>${c.amount}</td>
            <td>${c.transactionRef}</td>
            <td>${c.status}</td>
          </tr>
        `
        )
        .join("");

      const emailBody = `
        <p>Thank you for using Smart Purse, ${kitty.kittyName} contributors!</p>
        <p>Here is the latest summary of contributions for the kitty:</p>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Amount</th>
              <th>Transaction Ref</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <p>Total Contributions: <strong>${contributions.reduce(
          (sum, c) => sum + c.amount,
          0
        )}</strong></p>
        <p>Keep contributing and managing your savings with Smart Purse!</p>
        <p>Best regards, <br>The Smart Purse Team</p>
      `;

      // Send Email to All Contributors
      for (const email of contributorEmails) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: `Daily Contribution Summary for ${kitty.kittyName}`,
          html: emailBody,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error(`Failed to send email to ${email}:`, error);
          } else {
            console.log(`Email sent to ${email}:`, info.response);
          }
        });
      }
    }
  } catch (error) {
    console.error("Error in scheduled contribution summary:", error);
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
