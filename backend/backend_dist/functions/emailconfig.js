import nodemailer from "nodemailer";
const emailConfig = () => {
    const EMAIL_SERVICE = process.env.EMAIL_SERVICE_TYPE;
    let transporter;
    if (EMAIL_SERVICE === "gmail") {
        // console.log("here gmail");
        transporter = nodemailer.createTransport({
            service: "gmail",
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: {
                user: process.env.SENDER_EMAIL_ID,
                pass: process.env.SENDER_EMAIL_PASSWORD,
            },
        });
    }
    else if (EMAIL_SERVICE === "office365") {
        transporter = nodemailer.createTransport({
            host: "smtp.office365.com",
            port: 587,
            secure: false,
            auth: {
                user: process.env.SENDER_EMAIL_ID,
                pass: process.env.SENDER_EMAIL_PASSWORD,
            },
        });
    }
    else {
        throw new Error("Unsupported email service. Use 'gmail' or 'office365'.");
    }
    return transporter;
};
export default emailConfig;
