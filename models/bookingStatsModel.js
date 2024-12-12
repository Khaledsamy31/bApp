const mongoose = require('mongoose');

// إنشاء الـ Schema للإحصائيات
const bookingStatsSchema = new mongoose.Schema({
  totalBookings: { type: Number, required: true },
  cancelledBookings: { type: Number, required: true },
  netBookings: { type: Number, required: true },
  lastUpdated: { type: Date, required: true }, // تاريخ آخر تحديث

    // إضافة الإحصائيات الخاصة بالعملاء في الشهر الحالي
    monthlyCustomerStats: [{
        name: { type: String, required: true },
        bookings: { type: Number, required: true },
        month: { type: Number, required: true },
        year: { type: Number, required: true },
      }],

});


// إنشاء الـ Model بناءً على الـ Schema
const BookingStats = mongoose.model('BookingStats', bookingStatsSchema);

module.exports = BookingStats;
