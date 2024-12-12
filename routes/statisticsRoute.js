const express = require('express');
const {
  // getTopCustomers,
  // getTotalBookings,

  getBookingStats,
  getMonthlyStats,
  getYearlyStats,
  getAllTimeStats,
  getAllYears,
  getYearlyBookingStats,
  getAllYearlyBookingStats,
  getYearlyMetrics,
  getAllYearlyMetrics,
  getAllCustomerStats

} = require('../controller/statisticsController'); // استيراد الدوال من الـ controller

const authService = require("../controller/authController")


const router = express.Router();

router.get("/stats",
  authService.protect,
  authService.allowedTo("admin", "manager"),
  getBookingStats);
// router.get("/month/:month/:year",getMonthlyStats);


// استرجاع إحصائيات الحجز الشهرية
router.get('/month/:month/:year', 
  authService.protect,
  authService.allowedTo("admin", "manager"),
  getMonthlyStats);
  
router.get('/yearly/:year', 
  authService.protect,
  authService.allowedTo("admin", "manager"),
  getYearlyStats);

router.get('/topcustomers', 
  authService.protect,
  authService.allowedTo("admin", "manager"),
  getAllTimeStats);// للحصول على العملاء الاكثر حجزًا في جميع الاعوام

  router.get('/all-years-stats',
    authService.protect,
    authService.allowedTo("admin", "manager"),
    getAllYears);

    router.get('/stats/:year',
      authService.protect,
      authService.allowedTo("admin", "manager"),
      getYearlyBookingStats);

      router.get('/stats-all-years',
        authService.protect,
        authService.allowedTo("admin", "manager"),
        getAllYearlyBookingStats);


        // إرجاع إحصائيات سنة معينة
router.get('/yearly-monthly-stats/:year', getYearlyMetrics);

// إرجاع إحصائيات جميع السنوات
router.get('/yearly-stats', getAllYearlyMetrics);

// راوت لجلب إحصائيات العملاء (الجدد والقدامى)
router.get('/customer-stats-old-vs-new', getAllCustomerStats);

// المسارات الخاصة بالحجوزات
// router.get("/top-customers", getTopCustomers);  // العملاء الأكثر حجزًا
// router.get("/total-bookings", getTotalBookings);  // إجمالي الحجوزات


module.exports = router;
