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
    getSpecificBookingByVisitorOrUser,

    getAvailableTimesForClient,
    addWorkingHours,
    getWorkingHours,
    deleteWorkingHours,
    updateSpecificWorkingHour,
    getAvailableTimesForSpecificDate,

    getTypes,
    addType,
    updateType,
    deleteType,

    getSettings,
    updateMaintenanceMode,
    updateAdminMessage,
    updateContactNumbers,

    getBookingScope,
    updateBookingScope,

    getForbiddenDay,
    updateForbiddenDays,

    getCancelledAppointment,

    getAllVisitor,

    getTimezoneOffset,
    updateTimezoneOffset
} = require("../controller/bookingController");

const authService = require("../controller/authController")



// const { protect, restrictTo } = require("../middlewares/authMiddleware"); // تأكد من وجود Middleware للتحقق من الصلاحيات

const router = express.Router();



// الحصول على إعدادات النظام
router.get("/settings", getSettings);

// تحديث وضع الصيانة
router.put(
    "/settings/maintenance",
    authService.protect,
    authService.allowedTo("admin"),
    updateMaintenanceMode
);

// تحديث نص الأدمن
router.put(
    "/settings/admin-message",
    authService.protect,
    authService.allowedTo("admin", "manager"),
    updateAdminMessage
);

// تحديث أرقام الهاتف والواتساب
router.put(
    "/settings/contact-numbers",
    authService.protect,
    authService.allowedTo("admin", "manager"),
    updateContactNumbers
);

router.get("/types", getTypes); // الحصول على الأنواع
router.post("/types", authService.protect, authService.allowedTo("admin","manager"), addType); // إضافة نوع
router.put("/types", authService.protect, authService.allowedTo("admin", "manager"), updateType); // تعديل نوع
router.delete("/types", authService.protect, authService.allowedTo("admin", "manager"), deleteType); // حذف نوع

// مسار للحصول على الأيام المتاحة للحجز
router.get("/available-days", getTimezoneOffsetMiddleware, getAvailableDaysWithTimes); // مسار للحصول على الأيام المتاحة للحجز

// الحصول على جميع الزوار
router.get("/visitors", getAllVisitor);

// للحصول على الحجوزات بواسطة userId
router.get('/user/:userId', getUserOrVisitorBookings);

// للحصول على الحجوزات بواسطة visitorId
router.get('/visitor/:visitorId', getUserOrVisitorBookings);

// للحصول على الحجوزات بواسطة phoneNumber
router.get('/guestPhone/:phoneNumber', getUserOrVisitorBookings);




// مسار للحصول على الأوقات المتاحة للعميل
// مسار لإضافة ساعات العمل
router.get("/available-times",getTimezoneOffsetMiddleware, getAvailableTimesForClient); // مسار جديد
router.post("/working-hours", authService.protect, authService.allowedTo("admin", "manager"), addWorkingHours); // مسار جديد
router.get("/working-hours", authService.protect, authService.allowedTo("admin", "manager"), getWorkingHours); // مسار جديد
router.put("/working-hours",authService.protect, authService.allowedTo("admin", "manager"), updateSpecificWorkingHour); // مسار جديد
router.delete("/delete-time",authService.protect, authService.allowedTo("admin", "manager"), deleteWorkingHours); // حذف ساعات العمل
router.get("/working-hours/date", getAvailableTimesForSpecificDate);


// مسار للحصول على حجز معين بناءً على bookingId, userId, أو visitorId
router.get(
    "/visitorId/:visitorId/bookingId/:bookingId",
    getSpecificBookingByVisitorOrUser
);

router.get(
    "/userId/:userId/bookingId/:bookingId",
    getSpecificBookingByVisitorOrUser
);


// مسارات قيمة bookingScope
router.route("/booking-scope")
    .get(getBookingScope)
    .put(authService.protect, authService.allowedTo("admin"),updateBookingScope);

// مسارات قيمة forbiddenDay
router.route("/forbidden-day")
    .get(getForbiddenDay)
    .put(authService.protect, authService.allowedTo("admin"),updateForbiddenDays);



// مسار لإنشاء حجز
router.post("/",authService.optionalProtect, getTimezoneOffsetMiddleware, createBooking);

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
