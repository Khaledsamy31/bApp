const mongoose = require('mongoose');

const allTimeStatsSchema = new mongoose.Schema({
  topCustomers: [{
    _id: String,  // إما userId أو visitorId
    name: String, // اسم المستخدم أو "visitor" إذا كان زائرًا
    totalBookings: Number, // إجمالي الحجوزات
  }],
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("AllTimeStats", allTimeStatsSchema);
