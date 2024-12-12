const mongoose = require('mongoose');

// إنشاء Schema للإحصائيات السنوية والشهرية للعملاء الأكثر حجزًا
const annualBookingStatsSchema = new mongoose.Schema({
  year: { type: Number, required: true },
  monthlyCustomerStats: [
    {
      month: { type: Number, required: true },
      topCustomers: [
        {
          userId: { type: String, required: false },  // يمكن أن يكون null إذا كان زائر
          visitorId: { type: String, required: false }, // يمكن أن يكون null إذا كان مسجل
          name: { type: String },
          totalBookings: { type: Number }
        }
      ]
    }
  ],
  lastUpdated: { type: Date, required: true },
});

// إنشاء Model بناءً على الـ Schema
const AnnualBookingStats = mongoose.model('AnnualBookingStats', annualBookingStatsSchema);

module.exports = AnnualBookingStats;
