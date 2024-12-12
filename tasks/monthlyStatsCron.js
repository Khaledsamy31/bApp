const cron = require('node-cron');
const Booking = require('../models/bookingModel');
const BookingStats = require('../models/bookingStatsModel');

// دالة لحساب وتخزين الإحصائيات الشهرية
const calculateMonthlyStats = async (month, year) => {
  const startDate = new Date(year, month - 1, 1); // بداية الشهر
  const endDate = new Date(year, month, 0); // نهاية الشهر (اليوم الأخير)

  const totalBookings = await Booking.countDocuments({
    date: { $gte: startDate, $lt: endDate }
  });

  const cancelledBookings = await Booking.countDocuments({
    isCancelled: true,
    date: { $gte: startDate, $lt: endDate }
  });

  const netBookings = totalBookings - cancelledBookings;

  // إحصائيات العملاء في الشهر الحالي
  const customersThisMonth = await Booking.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lt: endDate }
      }
    },
    {
      $group: {
        _id: "$userId", // تجميع حسب الـ userId
        bookings: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userDetails"
      }
    },
    {
      $unwind: "$userDetails"
    },
    {
      $project: {
        name: "$userDetails.name",
        bookings: 1,
        month,
        year
      }
    },
    {
      $sort: { bookings: -1 }
    }
  ]);

  // حفظ الإحصائيات في قاعدة البيانات
  const bookingStats = new BookingStats({
    totalBookings,
    cancelledBookings,
    netBookings,
    lastUpdated: new Date(),
    month,
    year,
    monthlyCustomerStats: customersThisMonth
  });

  await bookingStats.save();
  console.log("تم تحديث الإحصائيات بنجاح!");
};

// جدولة تحديث الإحصائيات شهريًا في بداية كل شهر (الساعة 00:00)
cron.schedule('0 0 1 * *', () => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // getMonth() يعود من 0 إلى 11، لذلك نضيف 1
  const currentYear = currentDate.getFullYear();

  // حساب وتخزين إحصائيات الشهر الحالي
  calculateMonthlyStats(currentMonth, currentYear);
});

console.log("تم جدولة تحديث الإحصائيات الشهرية.");
