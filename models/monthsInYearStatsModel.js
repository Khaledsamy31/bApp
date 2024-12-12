const mongoose = require('mongoose');

// نموذج الإحصائيات الشهرية (الإحصائيات المرتبطة بكل شهر من السنة)
const monthlyMetricsSchema = new mongoose.Schema({
  monthIndex: {
    type: Number,  // الشهر (من 1 إلى 12)
    required: true,
  },
  totalOrders: {
    type: Number,
    required: true,
    default: 0,  // قيمة افتراضية
  },
  totalCancelledOrders: {
    type: Number,
    required: true,
    default: 0,  // قيمة افتراضية
  },
  netOrders: {
    type: Number,
    required: true,
    default: 0,  // قيمة افتراضية
  },
  cancellationPercentage: {
    type: String,  // نسبة الإلغاء مع الـ %
    required: true,
    default: '0%',  // قيمة افتراضية
  }
});

// نموذج الإحصائيات السنوية
const yearlyMetricsSchema = new mongoose.Schema({
  yearNumber: {
    type: Number,
    required: true,
    unique: true,
  },
  monthsData: [monthlyMetricsSchema],  // مصفوفة من الإحصائيات الشهرية
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// إنشاء النموذج
const YearlyMetrics = mongoose.model('YearlyMetrics', yearlyMetricsSchema);

module.exports = YearlyMetrics;




// const mongoose = require("mongoose");

// const statisticsSchema = new mongoose.Schema({
//   year: { type: Number, required: true }, // السنة
//   month: { type: Number, required: true }, // الشهر
//   customerId: { type: String, required: true }, // سواء كان الزائر أو المستخدم
//   totalBookings: { type: Number, default: 0 }, // عدد الحجوزات
//   isVisitor: { type: Boolean, required: true }, // إذا كان العميل زائر أو مستخدم
// }, { timestamps: true });

// // إنشاء فهرس لتسريع الاستعلامات
// statisticsSchema.index({ year: 1, month: 1, customerId: 1 }, { unique: true });

// module.exports = mongoose.model("Statistics", statisticsSchema);
