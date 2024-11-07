const express = require("express");

const getTimezoneOffsetMiddleware = require("../middlewares/getTimezoneOffsetMiddleware");

const {
    createBooking,
    cancelBooking,
    getAllBookings,
    getAvailableDaysWithTimes,
    addHoliday,
    updateHoliday,
    deleteHoliday,
    getAllHolidays, // مسار للحصول على العطلات
    getUserOrVisitorBookings,

    getAvailableTimesForClient,
    addWorkingHours,
    deleteWorkingHours,
    updateSpecificWorkingHour,
    getAvailableTimesForSpecificDate,

    getBookingScope,
    updateBookingScope,

    getForbiddenDay,
    updateForbiddenDays,

    getCancelledAppointment,

    getTimezoneOffset,
    updateTimezoneOffset
} = require("../controller/bookingController");

const authService = require("../controller/authController")



// const { protect, restrictTo } = require("../middlewares/authMiddleware"); // تأكد من وجود Middleware للتحقق من الصلاحيات

const router = express.Router();

// مسار للحصول على الأيام المتاحة للحجز
router.get("/available-days", getTimezoneOffsetMiddleware, getAvailableDaysWithTimes); // مسار للحصول على الأيام المتاحة للحجز

router.get('/guestPhone/:phoneNumber', getUserOrVisitorBookings);



// مسار للحصول على الأوقات المتاحة للعميل
// مسار لإضافة ساعات العمل
router.get("/available-times", getAvailableTimesForClient); // مسار جديد
router.post("/working-hours", authService.protect, authService.allowedTo("admin", "manager"), addWorkingHours); // مسار جديد
router.put("/working-hours",authService.protect, authService.allowedTo("admin", "manager"), updateSpecificWorkingHour); // مسار جديد
router.delete("/delete-time",authService.protect, authService.allowedTo("admin", "manager"), deleteWorkingHours); // حذف ساعات العمل
router.get("/working-hours/date", getAvailableTimesForSpecificDate);


// مسارات قيمة bookingScope
router.route("/booking-scope")
    .get(getBookingScope)
    .put(authService.protect, authService.allowedTo("admin"),updateBookingScope);

// مسارات قيمة forbiddenDay
router.route("/forbidden-day")
    .get(getForbiddenDay)
    .put(authService.protect, authService.allowedTo("admin"),updateForbiddenDays);



// مسار لإنشاء حجز
router.post("/",getTimezoneOffsetMiddleware, createBooking);

// مسار لإلغاء حجز
router.delete("/:id", cancelBooking);




// مسار للحصول على جميع الحجوزات
router.get("/",authService.protect, authService.allowedTo("admin", "manager"),getTimezoneOffsetMiddleware, getAllBookings);

//  مسار للحصول على جميع الحجوزات الملغية
router.get("/cancelled",authService.protect, authService.allowedTo("admin", "manager"),  getCancelledAppointment);



// مسار لإضافة عطلة جديدة (يجب أن يكون محميًا)
router.post("/holidays",authService.protect, authService.allowedTo("admin"),getTimezoneOffsetMiddleware, addHoliday); // فقط الأدمن يمكنه إضافة عطلات
router.put("/holidays/:id",authService.protect, authService.allowedTo("admin"), getTimezoneOffsetMiddleware, updateHoliday); // فقط الأدمن يمكنه تعديل عطلات
router.delete("/holidays/:id",authService.protect, authService.allowedTo("admin"), deleteHoliday); // فقط الأدمن يمكنه حذف عطلات

// مسار للحصول على جميع العطلات
router.get("/holidays", getAllHolidays); // مسار للحصول على جميع العطلات


// مسار `GET` للحصول على فرق التوقيت
router.get("/timezone-offset", getTimezoneOffset);

// مسار `POST` لتحديث فرق التوقيت
router.post("/timezone-offset",authService.protect, authService.allowedTo("admin"), updateTimezoneOffset);


module.exports = router;
