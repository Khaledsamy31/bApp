const BookingStats = require('../models/bookingStatsModel');
const asyncHandler = require('express-async-handler');
const ApiError = require("../utils/apiError");
const AnnualBookingStats = require('../models/monthlyStatsModel');  // نموذج الإحصائيات السنوية
const YearlyStats = require('../models/yearlyStatsModel');  // نموذج الإحصائيات السنوية
const AllTimeStats  = require('../models/topCustomersModel');  // نموذج الإحصائيات السنوية
const YearlyMetrics = require('../models/monthsInYearStatsModel');
const CustomerMetrics = require('../models/CustomerMetricsModel');


const YearlyCancellationStats = require('../models/YearlyCancellationAndBookingsStatsModel');  // نموذج تخزين الإحصائيات السنوية

const Booking = require('../models/bookingModel');  // نموذج الحجز
const cron = require('node-cron');

// دالة لاسترجاع الإحصائيات الأخيرة
exports.getBookingStats = asyncHandler(async (req, res, next) => {
  try {
    // استرجاع آخر إحصائيات موجودة
    const stats = await BookingStats.findOne({});
    
    if (!stats) {
      return next(new ApiError('Booking statistics not found', 404));
    }

    res.status(200).json(stats);
  } catch (err) {
    return next(new ApiError('Error fetching booking stats', 500));
  }
});

// دالة لحساب الإحصائيات للعملاء الأكثر حجزًا في كل شهر
const calculateMonthlyStats = async (month, year) => {
  const startDate = new Date(year, month - 1, 1); // بداية الشهر
  const endDate = new Date(year, month, 0); // نهاية الشهر (اليوم الأخير)

  // استعلام لحساب عدد الحجوزات لكل عميل (سواء مستخدم أو زائر)
  const customersThisMonth = await Booking.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lt: endDate }
      }
    },
    {
      $group: {
        _id: { $ifNull: ["$userId", "$visitorId"] },  // استخدام userId إذا كان موجودًا، وإذا لم يكن موجودًا نستخدم visitorId
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
      $unwind: {
        path: "$userDetails",
        preserveNullAndEmptyArrays: true  // هذا يسمح للمستخدمين الذين ليس لديهم تفاصيل (أي الزوار) بالظهور
      }
    },
    {
      $project: {
        _id: { $toString: "$_id" },  // تحويل _id إلى string (للتأكد من أنه UUID وليس ObjectId)
        name: {
          $cond: {
            if: { $eq: [{ $type: "$userDetails" }, "missing"] },  // إذا كانت تفاصيل المستخدم مفقودة (أي أنه زائر)
            then: "Visitor",  // استخدام "زائر" كاسم
            else: "$userDetails.name"  // وإلا استخدم اسم المستخدم
          }
        },
        totalBookings: "$bookings",
        month,
        year
      }
    },
    { $sort: { totalBookings: -1 } }  // ترتيب من الأكثر حجزًا إلى الأقل
  ]);

  return customersThisMonth;
};




// دالة لتحديث الإحصائيات السنوية في قاعدة البيانات
const updateAnnualStats = async (year) => {
  const months = Array.from({ length: 12 }, (_, index) => index + 1);

  // قم بحساب الإحصائيات لكل شهر في السنة
  const monthlyStats = await Promise.all(
    months.map((month) => calculateMonthlyStats(month, year))
  );

  const monthlyStatsData = months.map((month, index) => ({
    month,
    topCustomers: monthlyStats[index].map(customer => ({
      userId: customer._id,  // تأكد من تحويل الـ userId إلى String إذا كان UUID
      visitorId: customer.visitorId ? customer.visitorId : null,  // إذا كان موجودًا، تحويل visitorId إلى String
      name: customer.name,
      totalBookings: customer.totalBookings
    }))
  }));

  // حفظ أو تحديث الإحصائيات السنوية
  const existingStats = await AnnualBookingStats.findOne({ year });

  if (existingStats) {
    existingStats.monthlyCustomerStats = monthlyStatsData;
    existingStats.lastUpdated = new Date();
    await existingStats.save();
  } else {
    const newStats = new AnnualBookingStats({
      year,
      monthlyCustomerStats: monthlyStatsData,
      lastUpdated: new Date()
    });
    await newStats.save();
  }

  console.log(`Annual statistics for year ${year} have been updated!`);
};


// استدعاء دالة التحديث عند تشغيل السيرفر
const updateStatsOnStartup = async () => {
  const currentYear = new Date().getFullYear();
  await updateAnnualStats(currentYear);  // تحديث الإحصائيات للسنة الحالية
};

// استدعاء دالة التحديث شهريًا باستخدام cron
cron.schedule('0 0 1 * *', async () => {
  const currentYear = new Date().getFullYear();
  await updateAnnualStats(currentYear);  // تحديث الإحصائيات للسنة الحالية
  console.log(`Statistics updated for year ${currentYear} on the first day of the month.`);
});

// تشغيل التحديثات عند بدء السيرفر
updateStatsOnStartup();


const monthly = require('../models/monthlyStatsModel');


// دالة لاسترجاع الإحصائيات الشهرية
// دالة لاسترجاع الإحصائيات الشهرية مع pagination
exports.getMonthlyStats = async (req, res, next) => {
  const { month, year } = req.params;  // الحصول على الشهر والسنة من المتغيرات
  const { page = 1, limit = 10 } = req.query;  // الحصول على الصفحة والحد الأقصى من المعاملات (defaults: page 1, limit 10)

  try {
    // استرجاع الإحصائيات الشهرية بناءً على الشهر والسنة
    const stats = await monthly.findOne({
      year: parseInt(year),
      "monthlyCustomerStats.month": parseInt(month)
    });

    if (!stats) {
      return next(new ApiError("Booking statistics not found for this month", 404));
    }

    // البحث عن الإحصائيات الشهرية لهذا الشهر فقط
    const monthlyStats = stats.monthlyCustomerStats.find(stat => stat.month === parseInt(month));

    if (!monthlyStats) {
      return next(new ApiError("No statistics available for this month", 404));
    }

    // إضافة Pagination
    const totalResults = monthlyStats.topCustomers.length;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    // استخراج العملاء للصفحة الحالية
    const customers = monthlyStats.topCustomers.slice(startIndex, endIndex);

    // حساب عدد الصفحات الكلي
    const totalPages = Math.ceil(totalResults / limit);

    // حساب الصفحة السابقة والصفحة التالية
    const previousPage = page > 1 ? page - 1 : null;
    const nextPage = page < totalPages ? page + 1 : null;

    res.status(200).json({
      year: parseInt(year),
      month: parseInt(month),
      totalResults: totalResults,  // إجمالي النتائج
      totalPages: totalPages,      // إجمالي عدد الصفحات
      currentPage: parseInt(page), // الصفحة الحالية
      previousPage: previousPage,  // الصفحة السابقة إذا كانت موجودة
      nextPage: nextPage,          // الصفحة التالية إذا كانت موجودة
      limit: parseInt(limit),      // الحد الأقصى للنتائج في الصفحة
      topCustomers: customers      // العملاء في الصفحة الحالية
    });
  } catch (err) {
    return next(new ApiError("Error fetching monthly stats", 500));
  }
};



//============================ yearly


const calculateYearlyStats = async (year) => {
  const startOfYear = new Date(year, 0, 1);  // بداية السنة
  const startOfNextYear = new Date(year + 1, 0, 1);  // بداية السنة التالية (لتحديد نطاق البحث)

  // استعلام لحساب عدد الحجوزات لكل عميل (سواء مستخدم أو زائر) خلال السنة
  const customersThisYear = await Booking.aggregate([
    {
      $match: {
        date: { $gte: startOfYear, $lt: startOfNextYear }
      }
    },
    {
      $group: {
        _id: { $ifNull: ["$userId", "$visitorId"] },  // استخدام userId إذا كان موجودًا، وإذا لم يكن نستخدم visitorId
        totalBookings: { $sum: 1 }  // حساب إجمالي الحجوزات
      }
    },
    {
      $lookup: {
        from: "users",  // ربط المستخدمين بتفاصيلهم
        localField: "_id",
        foreignField: "_id",
        as: "userDetails"
      }
    },
    {
      $unwind: {
        path: "$userDetails",  // تفكيك البيانات
        preserveNullAndEmptyArrays: true  // السماح بعرض الزوار الذين ليس لديهم تفاصيل
      }
    },
    {
      $project: {
        _id: { $toString: "$_id" },  // تحويل _id إلى string
        name: {
          $cond: {
            if: { $eq: [{ $type: "$userDetails" }, "missing"] },  // إذا كانت تفاصيل المستخدم مفقودة
            then: "Visitor",  // استخدام "زائر" في حال عدم وجود تفاصيل
            else: "$userDetails.name"  // إذا كان المستخدم مسجلاً، استخدم اسمه
          }
        },
        totalBookings: "$totalBookings",  // إجمالي الحجوزات
        year
      }
    },
    { $sort: { totalBookings: -1 } }  // ترتيب العملاء حسب إجمالي الحجوزات
  ]);

  return customersThisYear;
};


const updateYearlyStats = async (year) => {
  const yearlyStats = await calculateYearlyStats(year);

  // تحويل العملاء إلى الشكل المطلوب
  const topYearlyCustomers = yearlyStats.map(customer => ({
    userId: customer._id,  // تأكد من تحويل الـ userId إلى string (UUID)
    visitorId: customer.visitorId ? customer.visitorId : null,  // إذا كان الزائر موجودًا
    name: customer.name,
    totalBookings: customer.totalBookings  // إجمالي الحجوزات
   
  }));

  // حفظ أو تحديث الإحصائيات السنوية
  const existingYearlyStats = await YearlyStats.findOne({ year });

  if (existingYearlyStats) {
    existingYearlyStats.topYearlyCustomers = topYearlyCustomers;
    existingYearlyStats.lastUpdated = new Date();
    await existingYearlyStats.save();
  } else {
    const newYearlyStats = new YearlyStats({
      year,
      topYearlyCustomers: topYearlyCustomers,
      lastUpdated: new Date()
    });
    await newYearlyStats.save();
  }

  console.log(`Yearly statistics for year ${year} have been updated!`);
};


// جدولة لتحديث الإحصائيات السنوية في بداية كل سنة
cron.schedule('0 0 1 1 *', async () => {  // التحديث في 1 يناير
  const currentYear = new Date().getFullYear();
  await updateYearlyStats(currentYear);  // تحديث الإحصائيات للسنة الحالية
  console.log(`Yearly statistics updated for year ${currentYear}`);
});

const updateYearlyStatsOnStartup = async () => {
  const currentYear = new Date().getFullYear();
  await updateYearlyStats(currentYear);  // تحديث الإحصائيات للسنة الحالية عند تشغيل السيرفر
  console.log(`Yearly statistics updated for year ${currentYear} on server startup.`);
};

// استدعاء التحديث عند تشغيل السيرفر
updateYearlyStatsOnStartup();  // عند بدء السيرفر سيتم تحديث الإحصائيات للسنة الحالية


// دالة لاسترجاع الإحصائيات السنوية
exports.getYearlyStats = asyncHandler(async (req, res, next) => {
  const { year } = req.params;  // الحصول على السنة من الـ params
  const { page = 1, limit = 10 } = req.query;  // الحصول على الصفحة والحد الأقصى من المعاملات (افتراضيًا الصفحة 1 و الحد 10)

  try {
    // استرجاع الإحصائيات السنوية بناءً على السنة
    const stats = await YearlyStats.findOne({ year: parseInt(year) });

    if (!stats) {
      return next(new ApiError("Booking statistics not found for this year", 404));
    }

    // التحقق من أن هناك إحصائيات شهرية في السنة المطلوبة
    const monthlyStats = stats.topYearlyCustomers;

    if (!monthlyStats || monthlyStats.length === 0) {
      return next(new ApiError("No yearly statistics available for this year", 404));
    }

    // التصفية والحد
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    // استخراج النتائج المحددة حسب الصفحة
    const paginatedResults = monthlyStats.slice(startIndex, endIndex);

    // إجمالي النتائج
    const totalResults = monthlyStats.length;

    // حساب عدد الصفحات الكلي
    const totalPages = Math.ceil(totalResults / limit);

    res.status(200).json({
      year: parseInt(year),
      totalResults: totalResults,  // إجمالي النتائج
      totalPages: totalPages,      // إجمالي عدد الصفحات
      currentPage: parseInt(page), // الصفحة الحالية
      limit: parseInt(limit),      // الحد الأقصى للنتائج في الصفحة
      topYearlyCustomers: paginatedResults  // الإحصائيات المعروضة في الصفحة الحالية
    });
  } catch (err) {
    return next(new ApiError("Error fetching yearly stats", 500));
  }
});

// دالة لاسترجاع السنوات فقط
exports.getAllYears = asyncHandler(async (req, res, next) => {
  try {
    // استرجاع السنوات المميزة
    const years = await YearlyStats.distinct('year');  // استرجاع السنوات فقط بدون باقي الإحصائيات

    if (!years || years.length === 0) {
      return next(new ApiError("No years found", 404));
    }

    res.status(200).json({
      totalResults: years.length,  // عدد السنوات
      years  // السنوات المسترجعة
    });
  } catch (err) {
    return next(new ApiError("Error fetching years", 500));
  }
});






//======================== top customers

// دالة لحساب الإحصائيات العملاء الأكثر حجزًا
const calculateAllTimeStats = async () => {

  
  // استخدام Aggregation لحساب عدد الحجوزات لكل عميل (سواء مستخدم أو زائر)
  const stats = await Booking.aggregate([
    
    {
      $group: {
        _id: { $ifNull: ["$userId", "$visitorId"] }, // استخدام userId أو visitorId
        totalBookings: { $sum: 1 }, // حساب إجمالي الحجوزات
      }
    },
    {
      $lookup: {
        from: "users",  // ربط بيانات المستخدمين
        localField: "_id",
        foreignField: "_id",
        as: "userDetails",
      }
    },
    {
      $unwind: {
        path: "$userDetails",  // تفكيك تفاصيل المستخدم
        preserveNullAndEmptyArrays: true, // السماح بعرض الزوار بدون تفاصيل
      }
    },
    {
      $project: {
        _id: { $toString: "$_id" },  // تحويل _id إلى String
        name: {
          $cond: {
            if: { $eq: [{ $type: "$userDetails" }, "missing"] }, // إذا كانت بيانات المستخدم مفقودة
            then: "visitor", // إذا كان زائرًا
            else: "$userDetails.name", // إذا كان مستخدمًا، استخدم اسمه
          }
        },
        totalBookings: "$totalBookings", // إجمالي الحجوزات
      }
    },
    { $sort: { totalBookings: -1 } }  // ترتيب حسب عدد الحجوزات
    
  ]);

  return stats;
};

// دالة لتخزين أو تحديث الإحصائيات الخاصة بالعملاء الأكثر حجزًا

const updateAllTimeStats = async () => {
  const stats = await calculateAllTimeStats();  // احسب الإحصائيات

  // تحديث أو إضافة الإحصائيات
  const existingStats = await AllTimeStats.findOne({});
  if (existingStats) {
    existingStats.topCustomers = stats;  // تحديث قائمة العملاء الأكثر حجزًا
    existingStats.lastUpdated = new Date();
    await existingStats.save();
  } else {
    const newStats = new AllTimeStats({
      topCustomers: stats,
      lastUpdated: new Date(),
    });
    await newStats.save();
  }

  console.log("All-time booking statistics have been updated!");
};

// استدعاء التحديث عند تشغيل السيرفر لأول مرة
const topCustupdateStatsOnStartup = async () => {
  await updateAllTimeStats();  // تحديث الإحصائيات عند بدء التشغيل
};

// جدولة التحديث كل أسبوع
cron.schedule('0 0 * * 0', async () => {
  await updateAllTimeStats();  // تحديث الإحصائيات كل أسبوع
  console.log("Weekly booking statistics updated.");
});

// استدعاء التحديث عند تشغيل السيرفر لأول مرة
topCustupdateStatsOnStartup();  // عند بدء السيرفر سيتم تحديث الإحصائيات


exports.getAllTimeStats = asyncHandler(async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;  // الحصول على الصفحة والحد الأقصى من المعاملات (defaults: page 1, limit 10)
    
    // حساب مؤشر البداية والنهاية بناءً على الصفحة والحد الأقصى
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    // استرجاع الإحصائيات من قاعدة البيانات
    const stats = await AllTimeStats.findOne({});
    if (!stats) {
      return next(new ApiError("No all-time booking statistics found", 404));
    }

    const totalResults = stats.topCustomers.length;  // إجمالي العملاء الأكثر حجزًا
    const totalPages = Math.ceil(totalResults / limit);  // حساب إجمالي الصفحات
    
    // تقسيم العملاء بناءً على الصفحة الحالية والحد الأقصى للنتائج
    const paginatedResults = stats.topCustomers.slice(startIndex, endIndex);

    // حساب الصفحة السابقة والتالية
    const previousPage = page > 1 ? page - 1 : null;
    const nextPage = page < totalPages ? page + 1 : null;

    // إرجاع البيانات مع معلومات التقسيم
    res.status(200).json({
      totalResults,            // إجمالي النتائج
      totalPages,              // إجمالي عدد الصفحات
      currentPage: parseInt(page),  // الصفحة الحالية
      previousPage,            // الصفحة السابقة (إذا كانت موجودة)
      nextPage,                // الصفحة التالية (إذا كانت موجودة)
      limit: parseInt(limit),  // الحد الأقصى للنتائج في الصفحة
      topCustomers: paginatedResults,  // العملاء في الصفحة الحالية
    });
  } catch (err) {
    return next(new ApiError("Error fetching all-time stats", 500));
  }
});



//  دالة لحساب الإحصائيات للسنة الحالية


const calculateYearlyBookingStats = async (year) => {
  console.log("Calculating yearly booking stats for year:", year);

  const startOfYear = new Date(year, 0, 1);  // بداية السنة
  const startOfNextYear = new Date(year + 1, 0, 1);  // بداية السنة التالية

  // حساب إجمالي الحجوزات لهذا العام (يشمل الحجوزات الملغاة)
  const totalBookings = await Booking.aggregate([
    {
      $match: {
        date: { $gte: startOfYear, $lt: startOfNextYear },  // تحديد فترة السنة
        // لا نستبعد الحجوزات الملغاة هنا
      }
    },
    { 
      $count: "totalBookings"  // العد الإجمالي للحجوزات
    }
  ]);
  console.log("Total Bookings:", totalBookings);

  // حساب إجمالي الحجوزات الملغاة لهذا العام
  const totalCancelledBookings = await Booking.aggregate([
    {
      $match: {
        date: { $gte: startOfYear, $lt: startOfNextYear },  // تحديد فترة السنة
        isCancelled: true  // فقط الحجوزات الملغاة
      }
    },
    { 
      $count: "totalCancelledBookings"  // العد الإجمالي للحجوزات الملغاة
    }
  ]);
  console.log("Total Cancelled Bookings:", totalCancelledBookings);

  // حساب صافي الحجوزات (إجمالي الحجوزات - إجمالي الحجوزات الملغاة)
  const netBookings = totalBookings[0] ? totalBookings[0].totalBookings - (totalCancelledBookings[0] ? totalCancelledBookings[0].totalCancelledBookings : 0) : 0;

  // حساب نسبة الحجوزات الملغاة إلى إجمالي الحجوزات
  const cancellationRate = totalBookings[0] && totalBookings[0].totalBookings > 0
  ? parseFloat(((totalCancelledBookings[0] ? totalCancelledBookings[0].totalCancelledBookings : 0) / totalBookings[0].totalBookings * 100).toFixed(2))
  : 0;  

  return {
    totalBookings: totalBookings[0] ? totalBookings[0].totalBookings : 0,
    totalCancelledBookings: totalCancelledBookings[0] ? totalCancelledBookings[0].totalCancelledBookings : 0,
    netBookings,  // الصافي
    cancellationRate
  };
};




const updateYearlyBookingStats = async (year) => {
  try {
    const stats = await calculateYearlyBookingStats(year);

    // التحقق إذا كانت هناك إحصائيات موجودة للسنة الحالية
    const existingStats = await YearlyCancellationStats.findOne({ year });

    if (existingStats) {
      // إذا كانت الإحصائيات موجودة، نقوم بتحديثها
      existingStats.totalBookings = stats.totalBookings;
      existingStats.totalCancelledBookings = stats.totalCancelledBookings;
      existingStats.netBookings = stats.netBookings;
      existingStats.cancellationRate = stats.cancellationRate;
      existingStats.lastUpdated = new Date();  // تحديث التاريخ

      // حفظ التغييرات
      await existingStats.save();
    } else {
      // إذا لم تكن الإحصائيات موجودة، نقوم بإنشاء مستند جديد
      const newStats = new YearlyCancellationStats({
        year,
        totalBookings: stats.totalBookings,
        totalCancelledBookings: stats.totalCancelledBookings,
        netBookings: stats.netBookings,
        cancellationRate: stats.cancellationRate,
        lastUpdated: new Date()  // إضافة تاريخ التحديث
      });

      // حفظ الإحصائيات الجديدة
      await newStats.save();
    }

    console.log(`Yearly booking statistics for year ${year} have been updated successfully!`);
  } catch (error) {
    console.error(`Error updating yearly booking statistics for year ${year}:`, error);
  }
};

// استدعاء التحديث عند تشغيل السيرفر
const updateStatsOfYearsOnStartup = async () => {
  const currentYear = new Date().getFullYear();
  await updateYearlyBookingStats(currentYear);  // تحديث الإحصائيات للسنة الحالية
  console.log(`Yearly booking statistics for year ${currentYear} have been updated on server startup.`);
};

// استدعاء التحديث عند تشغيل السيرفر
updateStatsOfYearsOnStartup();  // عند بدء السيرفر سيتم تحديث الإحصائيات للسنة الحالية

// تحديث الإحصائيات في بداية كل عام (1 يناير)
cron.schedule('0 0 1 1 *', async () => {
  const currentYear = new Date().getFullYear();
  await updateYearlyBookingStats(currentYear);  // تحديث الإحصائيات للسنة الحالية
  console.log(`Yearly booking statistics updated for year ${currentYear}`);
});

// دالة لاسترجاع إحصائيات سنة معينة
exports.getYearlyBookingStats = asyncHandler(async (req, res) => {
  const { year } = req.params;  // استلام السنة من باراميتر في URL

  // البحث عن الإحصائيات في قاعدة البيانات للسنة المحددة
  const stats = await YearlyCancellationStats.findOne({ year });

  if (!stats) {
    res.status(404).json({
      message: `No booking stats found for year ${year}`,
    });
    return;
  }

  // إرجاع الإحصائيات في الاستجابة
  res.status(200).json({
    year: stats.year,
    totalBookings: stats.totalBookings,
    totalCancelledBookings: stats.totalCancelledBookings,
    netBookings: stats.netBookings,
    cancellationRate: stats.cancellationRate  + '%' ,
  });
});

//دالة لإرجاع الإحصائيات لجميع السنوات:


// استرجاع جميع إحصائيات السنة
// استرجاع إحصائيات جميع السنوات
exports.getAllYearlyBookingStats = asyncHandler(async (req, res) => {
  try {
    // البحث عن جميع الإحصائيات في قاعدة البيانات
    const stats = await YearlyCancellationStats.find();

    console.log("Raw Stats from DB:", stats);  // تحقق من جميع البيانات التي تم جلبها

    // التحقق إذا كانت البيانات موجودة
    if (!stats || stats.length === 0) {
      return res.status(404).json({
        message: "No booking statistics found",
      });
    }

    // تنسيق الإحصائيات بحيث تحتوي على `cancellationRate` مع علامة الـ "%"
    const formattedStats = stats.map((stat) => {
      console.log("Processing Stat:", stat);  // تحقق من بيانات كل سنة

      // تأكد من وجود الحقل `year`
      if (!stat.year) {
        console.error("Year field is missing in stat:", stat);
      }

      // حساب نسبة الإلغاء
      const cancellationRate = stat.totalBookings > 0
        ? parseFloat(((stat.totalCancelledBookings / stat.totalBookings) * 100).toFixed(2))
        : 0;
      
      return {
        year: stat.year,  // تحقق من وجود السنة هنا
        totalBookings: stat.totalBookings,
        totalCancelledBookings: stat.totalCancelledBookings,
        netBookings: stat.netBookings,
        cancellationRate: `${cancellationRate}%`,  // إضافة النسبة مع علامة الـ %
      };
    });

    console.log("Formatted Stats:", formattedStats);  // تحقق من النتيجة النهائية

    // إرجاع النتيجة بالصيغة المطلوبة
    res.status(200).json({
      message: "Yearly booking statistics retrieved successfully.",
      data: formattedStats,
    });
  } catch (error) {
    console.error("Error retrieving yearly booking stats:", error);
    res.status(500).json({
      message: "Error retrieving yearly booking stats",
    });
  }
});



// احصائية الحجوزات في كل شهر من شهور السنة
const calculateYearlyData = async (year) => {
  const startOfYear = new Date(year, 0, 1);  // بداية السنة (1 يناير)
  const startOfNextYear = new Date(year + 1, 0, 1);  // بداية السنة التالية (1 يناير للسنة القادمة)

  const monthsData = [];

  // حساب الإحصائيات لكل شهر من يناير إلى ديسمبر
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const startOfMonth = new Date(year, monthIndex, 1);  // بداية الشهر
    const startOfNextMonth = new Date(year, monthIndex + 1, 1);  // بداية الشهر التالي

    // إجمالي الحجوزات في الشهر
    const totalBookingsInMonth = await Booking.aggregate([
      { 
        $match: { 
          date: { $gte: startOfMonth, $lt: startOfNextMonth },  // نطاق الشهر
        },
      },
      { $count: 'totalBookings' },
    ]);

    // إجمالي الحجوزات الملغاة في الشهر
    const cancelledBookingsInMonth = await Booking.aggregate([
      { 
        $match: { 
          date: { $gte: startOfMonth, $lt: startOfNextMonth },
          isCancelled: true,  // فقط الحجوزات الملغاة
        },
      },
      { $count: 'totalCancelledBookings' },
    ]);

    // حساب صافي الحجوزات للشهر
    const netBookings = totalBookingsInMonth[0]
      ? totalBookingsInMonth[0].totalBookings - (cancelledBookingsInMonth[0] ? cancelledBookingsInMonth[0].totalCancelledBookings : 0)
      : 0;

    // حساب نسبة الإلغاء للشهر
    const cancellationRate = totalBookingsInMonth[0] && totalBookingsInMonth[0].totalBookings > 0
      ? ((cancelledBookingsInMonth[0] ? cancelledBookingsInMonth[0].totalCancelledBookings : 0) / totalBookingsInMonth[0].totalBookings) * 100
      : 0;

    // إضافة البيانات الشهرية إلى المصفوفة
    monthsData.push({
      monthIndex: monthIndex + 1,  // monthIndex يبدأ من 1 (يناير هو 1 وليس 0)
      totalOrders: totalBookingsInMonth[0] ? totalBookingsInMonth[0].totalBookings : 0,
      totalCancelledOrders: cancelledBookingsInMonth[0] ? cancelledBookingsInMonth[0].totalCancelledBookings : 0,
      netOrders: netBookings,
      cancellationPercentage: `${cancellationRate.toFixed(2)}%`,  // نسبة الإلغاء مع تقريب الرقم إلى منزلتين عشريتين
    });
  }

  return monthsData;
};




const saveOrUpdateYearlyMetrics = async (year) => {
  try {
    // حساب الإحصائيات الشهرية
    const monthlyData = await calculateYearlyData(year);

    // التحقق إذا كانت هناك إحصائيات للسنة موجودة في قاعدة البيانات
    const existingYearlyData = await YearlyMetrics.findOne({ yearNumber: year });

    if (existingYearlyData) {
      // إذا كانت هناك إحصائيات، نقوم بتحديثها
      existingYearlyData.monthsData = monthlyData;
      existingYearlyData.updatedAt = new Date();  // تحديث التاريخ
      await existingYearlyData.save();
      console.log(`Updated yearly booking stats for year ${year}`);
    } else {
      // إذا لم تكن الإحصائيات موجودة، نقوم بإنشاء سجل جديد
      const newYearlyData = new YearlyMetrics({
        yearNumber: year,
        monthsData: monthlyData,
        updatedAt: new Date(),
      });
      await newYearlyData.save();
      console.log(`Created new yearly booking stats for year ${year}`);
    }
  } catch (error) {
    console.error(`Error saving/updating yearly booking stats for year ${year}:`, error);
  }
};



const updateMetricsAtStartup = async () => {
  const currentYear = new Date().getFullYear();
  try {
    await saveOrUpdateYearlyMetrics(currentYear);
    console.log(`Booking metrics for year ${currentYear} have been updated on server startup.`);
  } catch (error) {
    console.error(`Error updating metrics for year ${currentYear}:`, error);
  }
};

// استدعاء التحديث عند بدء التشغيل
updateMetricsAtStartup();


// تحديث الإحصائيات في بداية كل شهر (1 من كل شهر)
cron.schedule('0 0 1 * *', async () => {
  const currentMonth = new Date().getMonth() + 1; // getMonth() يعيد الشهر من 0 إلى 11
  const currentYear = new Date().getFullYear();
  await saveOrUpdateMonthlyMetrics(currentYear, currentMonth);
  console.log(`Booking metrics updated for month ${currentMonth}-${currentYear}`);
});

// تحديث الإحصائيات في بداية كل عام (1 يناير)
cron.schedule('0 0 1 1 *', async () => {
  const currentYear = new Date().getFullYear();
  await saveOrUpdateYearlyMetrics(currentYear);
  console.log(`Booking metrics updated for year ${currentYear}`);
});



exports.getYearlyMetrics = asyncHandler(async (req, res) => {
  const { year } = req.params;  // استلام السنة من باراميتر في URL

  // البحث عن الإحصائيات في قاعدة البيانات للسنة المحددة
  const stats = await YearlyMetrics.findOne({ yearNumber: year });

  if (!stats) {
    return res.status(404).json({
      message: `No booking stats found for year ${year}`,
    });
  }

  res.status(200).json({
    yearNumber: stats.yearNumber,
    monthsData: stats.monthsData,
  });
});



exports.getAllYearlyMetrics = asyncHandler(async (req, res) => {
  try {
    const stats = await YearlyMetrics.find();

    if (!stats || stats.length === 0) {
      return res.status(404).json({
        message: "No yearly booking statistics found",
      });
    }

    res.status(200).json({
      message: "Yearly booking statistics retrieved successfully.",
      data: stats,
    });
  } catch (error) {
    console.error("Error retrieving yearly booking stats:", error);
    res.status(500).json({
      message: "Error retrieving yearly booking stats",
    });
  }
});

//====================== العملاء الجدد والعملاء القدامى

const getAllCustomerStats = async () => {
  try {
    // العثور على جميع الحجوزات في قاعدة البيانات
    const allBookings = await Booking.find().select('phoneNumber date');

    // إنشاء مجموعة لحفظ أرقام الهواتف الفريدة للعملاء الجدد
    const newCustomerPhones = [];
    const oldCustomerPhones = [];

    // تحديد العملاء الجدد والعملاء القدامى بناءً على أرقام الهواتف
    allBookings.forEach((booking) => {
      const phoneNumber = booking.phoneNumber;
      const isExistingCustomer = oldCustomerPhones.includes(phoneNumber);

      if (isExistingCustomer) {
        // العميل القديم
        return;
      } else {
        if (newCustomerPhones.includes(phoneNumber)) {
          // إذا كان العميل قد قام بالحجز مسبقًا، فهو عميل قديم
          oldCustomerPhones.push(phoneNumber);
        } else {
          // إذا لم يكن رقم الهاتف موجودًا من قبل، فهو عميل جديد
          newCustomerPhones.push(phoneNumber);
        }
      }
    });

    // حساب إجمالي عدد العملاء الجدد والعملاء القدامى
    const newCustomersCount = newCustomerPhones.length;
    const oldCustomersCount = oldCustomerPhones.length;

    // حساب إجمالي عدد العملاء (الجدد + القدامى)
    const totalCustomersCount = newCustomersCount + oldCustomersCount;

    // حساب نسبة العملاء الجدد من إجمالي العملاء
    const newCustomersPercentage = totalCustomersCount > 0
      ? ((newCustomersCount / totalCustomersCount) * 100).toFixed(2)
      : 0;

    return {
      newCustomersCount,
      oldCustomersCount,
      totalCustomersCount,
      newCustomersPercentage: `${newCustomersPercentage}%`,
    };
  } catch (error) {
    console.error("Error calculating all customer stats:", error);
    throw error;
  }
};


const saveOrUpdateCustomerMetrics = async () => {
  try {
    const customerStats = await getAllCustomerStats();

    // التحقق إذا كانت هناك إحصائيات للعملاء موجودة في قاعدة البيانات
    const existingCustomerData = await CustomerMetrics.findOne({});

    if (existingCustomerData) {
      // إذا كانت هناك إحصائيات، نقوم بتحديثها
      existingCustomerData.newCustomersCount = customerStats.newCustomersCount;
      existingCustomerData.oldCustomersCount = customerStats.oldCustomersCount;
      existingCustomerData.totalCustomersCount = customerStats.totalCustomersCount;
      existingCustomerData.newCustomersPercentage = customerStats.newCustomersPercentage;
      existingCustomerData.updatedAt = new Date();  // تحديث التاريخ
      await existingCustomerData.save();
      console.log(`Updated customer stats.`);
    } else {
      // إذا لم تكن الإحصائيات موجودة، نقوم بإنشاء سجل جديد
      const newCustomerData = new CustomerMetrics({
        newCustomersCount: customerStats.newCustomersCount,
        oldCustomersCount: customerStats.oldCustomersCount,
        totalCustomersCount: customerStats.totalCustomersCount,
        newCustomersPercentage: customerStats.newCustomersPercentage,
        updatedAt: new Date(),
      });
      await newCustomerData.save();
      console.log(`Created new customer stats.`);
    }
  } catch (error) {
    console.error("Error saving/updating customer stats:", error);
  }
};

// تحديث إحصائيات العملاء عند بدء السيرفر
const updateCustomerStatsAtStartup = async () => {
  try {
    await saveOrUpdateCustomerMetrics();
    console.log('Customer stats have been updated on server startup.');
  } catch (error) {
    console.error('Error updating customer stats at startup:', error);
  }
};

// تحديث إحصائيات العملاء كل شهر
const scheduleMonthlyCustomerStatsUpdate = () => {
  cron.schedule('0 0 1 * *', async () => {
    // يتم تنفيذ هذا الكود في اليوم الأول من كل شهر في منتصف الليل
    try {
      await saveOrUpdateCustomerMetrics();
      console.log('Customer stats have been updated on the first day of the month.');
    } catch (error) {
      console.error('Error updating customer stats during monthly update:', error);
    }
  });
};

// استدعاء التحديث عند بدء التشغيل
updateCustomerStatsAtStartup();

// جدولة التحديث الشهري
scheduleMonthlyCustomerStatsUpdate();



exports.getAllCustomerStats = asyncHandler(async (req, res) => {
  try {
    const stats = await CustomerMetrics.findOne();

    if (!stats) {
      return res.status(404).json({
        message: "No customer stats found",
      });
    }

    res.status(200).json({
      message: "Customer stats retrieved successfully.",
      data: stats,
    });
  } catch (error) {
    console.error("Error retrieving customer stats:", error);
    res.status(500).json({
      message: "Error retrieving customer stats",
    });
  }
});
