// models/Settings.js
const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
    bookingScope: { type: Number, default: 3 }, // عدد الأيام المسموح بها للحجز
    forbiddenDays: {
        type: [String], // قائمة بالأيام المحظورة
        default: ["الجمعة"], // افتراضيًا: الجمعة فقط
    },
    timezoneOffset: {
        type: Number, // فرق التوقيت بالساعات من UTC، على سبيل المثال +2 لمصر
        default: 2 // افتراضيًا فرق التوقيت في مصر
    }
});

module.exports = mongoose.model("Settings", settingsSchema);
