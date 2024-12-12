const mongoose = require('mongoose');

// Schema للإحصائيات السنوية للعملاء الأكثر حجزًا
const yearlyBookingStatsSchema = new mongoose.Schema({
  year: { type: Number, required: true },  // السنة
  topYearlyCustomers: [  // العملاء الأكثر حجزًا في السنة
    {
      userId: { type: String, required: false },  // يمكن أن يكون null إذا كان زائر
      visitorId: { type: String, required: false }, // يمكن أن يكون null إذا كان مسجل
      name: { type: String },  // اسم العميل
      totalBookings: { type: Number }  // إجمالي الحجوزات
    }
  ],
  lastUpdated: { type: Date, required: true },  // تاريخ آخر تحديث
});

// Model بناءً على الـ Schema
const YearlyStats = mongoose.model('YearlyStats', yearlyBookingStatsSchema);

module.exports = YearlyStats;
