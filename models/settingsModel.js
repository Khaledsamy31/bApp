// models/Settings.js
const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
    bookingScope: { 
        type: Number, 
        default: 3,
        min: [1, "Booking scope must be at least 1 day"], // الحد الأدنى لعدد الأيام
        max: [30, "Booking scope cannot exceed 30 days"], // الحد الأقصى لعدد الأيام
        required: [true, "Booking scope is required"], // رسالة عند عدم تحديد القيمة
         },
          // عدد الأيام المسموح بها للحجز
    forbiddenDays: {
        type: [String],
        default: ["الجمعة"],
        validate: {
            validator: function(days) {
                // التحقق من أن الأيام ضمن قائمة معروفة
                const validDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
                return days.every(day => validDays.includes(day));
            },
            message: "Each forbidden day must be a valid Arabic day name (e.g., الأحد, الإثنين)", // رسالة عند وجود يوم غير صحيح
        },
    },
    
    timezoneOffset: {
        type: Number, // فرق التوقيت بالساعات من UTC، على سبيل المثال +2 لمصر
        default: 2, // افتراضيًا فرق التوقيت في مصر.
        min: [0, "Timezone offset cannot be less than 0"], // أقل فرق توقيت ممكن
        max: [2, "Timezone offset cannot exceed 2"], // أكبر فرق توقيت ممكن
    },
    types: { // قائمة الأنواع
        type: [String], // مصفوفة نصوص
        validate: {
            validator: function(types) {
                const minLength = 2; // الحد الأدنى لعدد الأحرف
                const maxLength = 20; // الحد الأقصى لعدد الأحرف
                return types.every(
                    (type) =>
                        typeof type === "string" &&
                        type.length >= minLength &&
                        type.length <= maxLength
                );
            },
            message: "Each type must be a string with a length between 2 and 30 characters",
        },
    },
    maintenanceMode: { 
        type: Boolean, 
        default: false, // افتراضيًا وضع الصيانة مغلق
    },
    maintenanceMessage: {
        type: String,
        default: "النظام تحت الصيانة حاليًا. سنعود قريبًا، نعتذر عن الإزعاج.", // رسالة افتراضية
        maxlength: [200, "Maintenance message must not exceed 200 characters"], // الحد الأقصى
    },
    adminMessage: {
        type: String,
        default: "", // نص يرسله الأدمن في فورم الحجز
        maxlength: [100, "Admin message must not exceed 100 characters"], // الحد الأقصى
    },
    phoneNumber: {
        type: String,
        match: [/^\d{11}$/, "Phone number must contain exactly 11 digits"], // تحقق من أن الرقم يحتوي على 11 رقمًا فقط
        default: "", // الهاتف الرئيسي
    },
    whatsappNumber: {
        type: String,
        match: [/^\d{11}$/, "WhatsApp number must contain exactly 11 digits"], // تحقق من أن الرقم يحتوي على 11 رقمًا فقط
        default: "", // رقم الواتساب الافتراضي
    },
},{timestamps:true});

module.exports = mongoose.model("Settings", settingsSchema);
