const mongoose = require('mongoose');

const customerMetricsSchema = new mongoose.Schema(
  {
    newCustomersCount: {
      type: Number,
      required: true,
      default: 0,
    },
    oldCustomersCount: {
      type: Number,
      required: true,
      default: 0,
    },
    totalCustomersCount: {
      type: Number,
      required: true,
      default: 0,
    },
    newCustomersPercentage: {
      type: String, // لحفظ النسبة المئوية كنص
      required: true,
      default: '0%',
    },
    updatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true, // لإنشاء createdAt و updatedAt تلقائيًا
  }
);

// إنشاء نموذج (Model) بناءً على الـ Schema
const CustomerMetrics = mongoose.model('CustomerMetrics', customerMetricsSchema);

module.exports = CustomerMetrics;
