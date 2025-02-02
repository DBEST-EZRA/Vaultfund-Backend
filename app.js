const nodemailer = require("nodemailer");

//Sending Emails
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "ezradbest101@gmail.com",
    pass: "sbld khmt xlpf bujc",
  },
});

const mailOptions = {
  from: "ezradbest101@gmail.com",
  to: "dr.ezraofficial@gmail.com",
  subject: "Test Email",
  text: "Hello, this is a test email from Node.js using Nodemailer!",
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    return console.log("Error: ", error);
  }
  console.log("Email sent: " + info.response);
});
