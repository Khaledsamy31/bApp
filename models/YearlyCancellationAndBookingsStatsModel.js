const mongoose = require('mongoose');

const yearlyCancellationStatsSchema = new mongoose.Schema({
  year: {
    type: Number,
    required: true,
    unique: true
  },
  totalBookings: {
    type: Number,
    required: true
  },
  totalCancelledBookings: {
    type: Number,
    required: true
  },
  netBookings: {
    type: Number,
    required: true
  },
  cancellationRate: {
    type: Number,  // ستظل كـ رقم هنا
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

const YearlyCancellationStats = mongoose.model('YearlyCancellationStats', yearlyCancellationStatsSchema);

module.exports = YearlyCancellationStats;
