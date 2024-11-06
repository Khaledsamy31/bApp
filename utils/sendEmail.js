const nodemailer = require("nodemailer")

const sendEmail = async(options)=>{

    // 1- create transporter (service that will send email, like "gmail", "mailgun", "mailtrap", "sendGrid")
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT, // if secure false port = 587, if true port = 465
        secure: false,
        auth:{
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    })

    // 2- define email options (like from, to, subject, email content)

    const mailOptions = {
        from: "e-shop app <pad6558@gmail.com>",
        to: options.email,
        subject: options.subject,
        text: options.message
    }

    // 3- send email
    await transporter.sendMail(options)
}

module.exports = sendEmail;