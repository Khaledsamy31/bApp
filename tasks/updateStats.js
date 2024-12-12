const cron = require('node-cron');
const Booking = require('../models/bookingModel');
const BookingStats = require('../models/bookingStatsModel');

// وظيفة لتحديث الإحصائيات
async function updateBookingStats() {
  try {
    const totalBookings = await Booking.countDocuments();
    const cancelledBookings = await Booking.countDocuments({ isCancelled: true });
    const netBookings = await Booking.countDocuments({ isCancelled: false });

    console.log(`Total bookings: ${totalBookings}, Cancelled: ${cancelledBookings}, Net: ${netBookings}`);

    // تحديث الإحصائيات في قاعدة البيانات
    const stats = await BookingStats.findOneAndUpdate(
      {},  // نبحث عن مستند واحد فقط لأنه لا يوجد غيره
      { totalBookings, cancelledBookings, netBookings, lastUpdated: new Date() },  // البيانات الجديدة
      { upsert: true }  // إذا لم يتم العثور على مستند، يتم إنشاؤه
    );

    console.log('Booking statistics updated successfully:', stats);
  } catch (error) {
    console.error('Error updating booking statistics:', error);
  }
}

// قم بتحديث الإحصائيات عند بدء الخادم مباشرة
updateBookingStats();

// جدولة مهمة لتحديث الإحصائيات يومياً عند منتصف الليل (الساعة 00:00)
cron.schedule('0 0 * * *', updateBookingStats);

