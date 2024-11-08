const asyncHandler = require("express-async-handler");
const Booking = require("../models/bookingModel");
const ApiError = require("../utils/apiError");
const holidayModel = require("../models/holidayModel");
const WorkingHoursModel = require('../models/workHoursModel');
const settingsModel = require("../models/settingsModel");
const { v4: uuidv4 } = require('uuid');


// استرجاع الأوقات المتاحة لليوم المحدد بناءً على يوم الأسبوع واستبعاد الأوقات المحجوزة
async function getAvailableTimesByDayOfWeek(date, dayOfWeek, timezoneOffset) {
    console.log(`Getting available times for date: ${date} (dayOfWeek: ${dayOfWeek})`);

    const workingHours = await WorkingHoursModel.findOne({ dayOfWeek }, 'hours').lean();
    if (!workingHours) {
        console.log(`No working hours found for dayOfWeek: ${dayOfWeek}`);
        return [];
    }

    const bookedTimesArray = (await Booking.find({ date, isCancelled: false }).select('time').lean())
        .map(b => b.time);

    const nowUTC = new Date();
    nowUTC.setUTCHours(nowUTC.getUTCHours() + timezoneOffset);
    const currentMinutesInUTC = nowUTC.getUTCHours() * 60 + nowUTC.getUTCMinutes();

    const availableTimes = workingHours.hours.filter(time => {
        const [timePart, period] = time.split(" ");
        let [hours, minutes] = timePart.split(":").map(Number);
        if (period === "PM" && hours < 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;

        const timeInMinutes = hours * 60 + minutes;
        return timeInMinutes > currentMinutesInUTC && !bookedTimesArray.includes(time);
    });

    return availableTimes;
}




// عرض الأوقات المتاحة بناءً على الأيام المتاحة للحجز
exports.getAvailableTimesForClient = asyncHandler(async (req, res, next) => {
    try {
        const availableDays = await exports.getAvailableDaysWithTimes(req, res, next);

        if (!availableDays) {
            return res.status(204).json({ message: "لا توجد أيام متاحة." });
        }

        return res.status(200).json({
            results: availableDays.length,
            data: availableDays
        });
    } catch (error) {
        if (!res.headersSent) {
            next(error);
        } else {
            console.log("Response was already sent in getAvailableTimesForClient.");
        }
    }
});

// إضافة ساعات العمل لليوم
exports.addWorkingHours = asyncHandler(async (req, res, next) => {
    const { dayOfWeek, hours } = req.body;
    console.log("Received data:", { dayOfWeek, hours });

    const timeFormatRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
    const validHours = hours.filter(time => timeFormatRegex.test(time));

    if (validHours.length !== hours.length) {
        return res.status(400).json({
            message: "بعض الأوقات غير صالحة. يرجى إدخال الأوقات بتنسيق صحيح HH:MM AM/PM."
        });
    }

    let existingHours = await WorkingHoursModel.findOne({ dayOfWeek });
    console.log("الساعات الموجودة ليوم:", dayOfWeek, existingHours ? existingHours.hours : "لا توجد ساعات");

    if (existingHours) {
        existingHours.hours = [...new Set([...existingHours.hours, ...validHours])];
        await existingHours.save();
        return res.status(200).json({ message: "تم تحديث ساعات العمل بنجاح." });
    }

    const workingHours = new WorkingHoursModel({ dayOfWeek, hours: validHours });
    await workingHours.save();
    res.status(201).json({ message: "تم إضافة ساعات العمل بنجاح." });
});


exports.getAvailableDaysWithTimes = async (req, res, next) => {
    try {
        console.log("Entering getAvailableDaysWithTimes function...");
        const bookingSettings = await settingsModel.findOne().lean();
        const bookingScope = bookingSettings ? bookingSettings.bookingScope : 3;
        const forbiddenDays = new Set(bookingSettings ? bookingSettings.forbiddenDays : ["الجمعة"]);

        const availableDays = [];
        const today = new Date();

        const datesToCheck = Array.from({ length: bookingScope }, (_, i) => {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            return date;
        });
        console.log("Dates to check:", datesToCheck);

        console.time("DB queries");
        const [holidays, workingHours, bookedTimes] = await Promise.all([
            holidayModel.find({ date: { $in: datesToCheck } }).lean(),
            WorkingHoursModel.find({}, 'dayOfWeek hours').lean(),
            Booking.find({ date: { $in: datesToCheck }, isCancelled: false }).select('date time').lean()
        ]);
        console.timeEnd("DB queries");

        const holidayDates = new Set(holidays.map(holiday => holiday.date.toISOString().split('T')[0]));
        const workingHoursMap = workingHours.reduce((map, wh) => {
            map[wh.dayOfWeek] = wh.hours;
            return map;
        }, {});
        const bookedTimesMap = bookedTimes.reduce((map, booking) => {
            const dateKey = booking.date.toISOString().split('T')[0];
            if (!map[dateKey]) {
                map[dateKey] = new Set();
            }
            map[dateKey].add(booking.time);
            return map;
        }, {});

        console.log("Holiday Dates Set:", holidayDates);
        console.log("Working Hours Map:", workingHoursMap);
        console.log("Booked Times Map:", bookedTimesMap);

        const daysPromises = datesToCheck.map(async (currentDate) => {
            const dayOfWeek = currentDate.getDay();
            const dateString = currentDate.toISOString().split('T')[0];
            const dayName = currentDate.toLocaleString('ar-EG', { weekday: 'long' });

            console.log(`Processing date: ${dateString} (${dayName})`);

            if (!forbiddenDays.has(dayName) && !holidayDates.has(dateString)) {
                const workingHoursForDay = workingHoursMap[dayOfWeek] || [];
                const bookedTimesForDay = bookedTimesMap[dateString] || new Set();

                const availableTimes = workingHoursForDay.filter(time => !bookedTimesForDay.has(time));

                console.log(`Available times for ${dayName} (${dateString}):`, availableTimes);

                return {
                    date: dateString,
                    dayName,
                    availableTimes
                };
            } else {
                console.log(`Skipping ${dayName} (${dateString}) - Holiday or forbidden day.`);
            }
            return null;
        });

        const results = await Promise.all(daysPromises);
        const filteredResults = results.filter(day => day !== null);

        console.log("Final available days and times:", filteredResults);

        return res.status(200).json({
            results: filteredResults.length,
            data: filteredResults
        });
    } catch (error) {
        console.error("Error in getAvailableDaysWithTimes:", error);
        if (!res.headersSent) {
            return next(error);
        }
    }
};

// الحصول على اوقات العمل من خلال التاريخ
exports.getAvailableTimesForSpecificDate = asyncHandler(async (req, res, next) => {
    const { date } = req.body; // استلام التاريخ من Body

    // التحقق من صحة المدخل
    if (!date || isNaN(Date.parse(date))) {
        return res.status(400).json({
            message: "يرجى تقديم تاريخ صالح بصيغة YYYY-MM-DD."
        });
    }

    const inputDate = new Date(`${date}T00:00:00Z`); // تحويل التاريخ إلى UTC
    const dayOfWeek = inputDate.getDay(); // الحصول على رقم اليوم في الأسبوع (0 = الأحد, 6 = السبت)
    const dateString = inputDate.toISOString().split("T")[0]; // تحويل التاريخ لصيغة YYYY-MM-DD

    // جلب الإعدادات العامة
    const settings = await settingsModel.findOne().lean();
    const forbiddenDays = new Set(settings?.forbiddenDays || ["الجمعة"]);

    // التحقق مما إذا كان اليوم محظورًا
    const dayName = inputDate.toLocaleString("ar-EG", { weekday: "long" });
    if (forbiddenDays.has(dayName)) {
        return res.status(400).json({
            message: `اليوم ${dayName} (${dateString}) هو يوم محظور للحجز.`
        });
    }

    // التحقق مما إذا كان اليوم عطلة
    const isHoliday = await holidayModel.findOne({ date: inputDate }).lean();
    if (isHoliday) {
        return res.status(400).json({
            message: `اليوم ${dayName} (${dateString}) هو عطلة: ${isHoliday.description || "عطلة عامة"}.`
        });
    }

    // جلب ساعات العمل لهذا اليوم
    const workingHours = await WorkingHoursModel.findOne({ dayOfWeek }).lean();
    if (!workingHours || workingHours.hours.length === 0) {
        return res.status(404).json({
            message: `لا توجد ساعات عمل محددة ليوم ${dayName} (${dateString}).`
        });
    }

    // جلب الأوقات المحجوزة لليوم
    const bookedTimes = await Booking.find({ date: inputDate, isCancelled: false }).select("time").lean();
    const bookedTimesSet = new Set(bookedTimes.map(b => b.time));

    // حساب الأوقات المتاحة
    const availableTimes = workingHours.hours.filter(time => !bookedTimesSet.has(time));

    return res.status(200).json({
        date: dateString,
        dayName,
        availableTimes
    });
});




// حذف ساعات العمل
const daysOfWeekMap = {
    "الأحد": 0,
    "الإثنين": 1,
    "الثلاثاء": 2,
    "الأربعاء": 3,
    "الخميس": 4,
    "الجمعة": 5,
    "السبت": 6
};

exports.deleteWorkingHours = asyncHandler(async (req, res, next) => {
    const { dayOfWeek, time } = req.body; // استلام اليوم والوقت من `body`

    // تحويل اسم اليوم إلى رقم باستخدام `daysOfWeekMap`
    const dayOfWeekNumber = daysOfWeekMap[dayOfWeek];
    if (dayOfWeekNumber === undefined) {
        return next(new ApiError(`Invalid dayOfWeek name: ${dayOfWeek}. Please provide a valid day name in Arabic.`, 400));
    }

    // إذا تم تحديد وقت، احذف الوقت فقط
    if (time) {
        const workingHours = await WorkingHoursModel.findOne({ dayOfWeek: dayOfWeekNumber });

        if (!workingHours) {
            return next(new ApiError(`No working hours found for day: ${dayOfWeek}`, 404));
        }

        // حذف الوقت المحدد من الساعات
        workingHours.hours = workingHours.hours.filter(hour => hour !== time);

        // حفظ التعديلات حتى إذا كانت قائمة الساعات فارغة
        await workingHours.save();

        return res.status(200).json({ message: `Time ${time} removed from day ${dayOfWeek}` });
    }

    // إذا لم يتم تحديد وقت، ارجع خطأ حيث يجب تقديم وقت معين
    return next(new ApiError("Please specify a time to delete.", 400));
});

// تحديث ساعات العمل
exports.updateSpecificWorkingHour = asyncHandler(async (req, res, next) => {
    const { dayOfWeek, oldTime, newTime } = req.body;

    // تحويل اسم اليوم إلى رقم باستخدام daysOfWeekMap
    const dayOfWeekNumber = daysOfWeekMap[dayOfWeek];
    if (dayOfWeekNumber === undefined) {
        return next(new ApiError(`اسم اليوم غير صحيح: ${dayOfWeek}. يرجى إدخال اسم يوم صحيح باللغة العربية.`, 400));
    }

    if (!oldTime || !newTime) {
        return next(new ApiError("oldTime and newTime is required", 400));
    }

    // تحقق من صحة تنسيق الوقت باستخدام regex
    const timeFormatRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
    if (!timeFormatRegex.test(newTime)) {
        return next(new ApiError("تنسيق الوقت غير صالح. يرجى استخدام التنسيق HH:MM AM/PM.", 400));
    }

    // البحث عن الساعات المتاحة لليوم المطلوب
    let workingHours = await WorkingHoursModel.findOne({ dayOfWeek: dayOfWeekNumber });

    // التحقق مما إذا كان السجل موجوداً
    if (!workingHours) {
        return next(new ApiError(`لم يتم العثور على ساعات العمل لليوم: ${dayOfWeek}.`, 404));
    }

    // التحقق مما إذا كان oldTime موجوداً في قائمة الساعات
    const timeIndex = workingHours.hours.indexOf(oldTime);
    if (timeIndex === -1) {
        return next(new ApiError(`لم يتم العثور على الوقت ${oldTime} لليوم ${dayOfWeek}.`, 404));
    }

    // استبدال الوقت القديم بالوقت الجديد
    workingHours.hours[timeIndex] = newTime;
    await workingHours.save(); // حفظ التعديلات

    res.status(200).json({ message: `تم تحديث الوقت من ${oldTime} إلى ${newTime} لليوم ${dayOfWeek}`, data: workingHours });
});



// جلب إعدادات الحجز الحالية
exports.getBookingScope = asyncHandler(async (req, res) => {
    const settings = await settingsModel.findOne().lean() || await settingsModel.create({ bookingScope: 3 });
    res.status(200).json({ bookingScope: settings.bookingScope });
});

// تحديث نطاق الحجز
exports.updateBookingScope = asyncHandler(async (req, res) => {
    const { bookingScope } = req.body;
    const settings = await settingsModel.findOneAndUpdate(
        {},
        { bookingScope },
        { new: true, upsert: true }
    ).lean();
    res.status(200).json({ message: "تم تحديث نطاق الحجز بنجاح", data: settings.bookingScope });
});

// جلب الأيام المحظورة الحالية
exports.getForbiddenDay = asyncHandler(async (req, res) => {
    let settings = await settingsModel.findOne();
    if (!settings) {
        settings = await settingsModel.create({ forbiddenDays: ["الجمعة"] });
    }
    res.status(200).json({ forbiddenDays: settings.forbiddenDays });
});

// تحديث الأيام المحظورة
exports.updateForbiddenDays = asyncHandler(async (req, res) => {
    const { forbiddenDays } = req.body;
    if (!Array.isArray(forbiddenDays)) {
        return res.status(400).json({ message: "يجب أن تكون العطلات الثابتة مصفوفة []" });
    }

    const validDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const invalidDays = forbiddenDays.filter(day => !validDays.includes(day));
    if (invalidDays.length > 0) {
        return res.status(400).json({ message: `الأيام التالية غير صحيحة: ${invalidDays.join(', ')}` });
    }

    const settings = await settingsModel.findOneAndUpdate(
        {},
        { forbiddenDays },
        { new: true, upsert: true }
    ).lean();
    res.status(200).json({ message: "تم تحديث العطلات الثابتة بنجاح", data: settings.forbiddenDays });
});

// إنشاء حجز جديد
exports.createBooking = asyncHandler(async (req, res, next) => {
    const { userName, phoneNumber, date, time, type, notes } = req.body;
    const timezoneOffset = req.timezoneOffset;

    const bookingDate = new Date(date);
    const [timePart, period] = time.split(" ");
    let [hours, minutes] = timePart.split(":").map(Number);
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    bookingDate.setUTCHours(hours + timezoneOffset, minutes, 0, 0);

    // تحقق من أن تاريخ ووقت الحجز أكبر من الوقت الحالي
    const currentTime = new Date();
    currentTime.setUTCHours(currentTime.getUTCHours() + timezoneOffset);
    if (bookingDate < currentTime) {
        return next(new ApiError("لا يمكن حجز موعد في الماضي. يرجى اختيار موعد مستقبلي.", 400));
    }

    // التحقق من الأوقات المتاحة
    const dayOfWeek = bookingDate.getUTCDay();
    const availableTimes = await getAvailableTimesByDayOfWeek(date, dayOfWeek, timezoneOffset);
    if (!availableTimes.includes(time)) {
        return next(new ApiError("الوقت المطلوب غير متاح للحجز. يرجى اختيار وقت آخر.", 400));
    }

    // التحقق من وجود حجز سابق غير ملغى لنفس العميل
    const existingBooking = await Booking.findOne({ phoneNumber, isCancelled: false });
    if (existingBooking) {
        const existingBookingDateTime = new Date(existingBooking.date);
        const [existingTimePart, existingPeriod] = existingBooking.time.split(" ");
        let [existingHours, existingMinutes] = existingTimePart.split(":").map(Number);
        if (existingPeriod === "PM" && existingHours < 12) existingHours += 12;
        if (existingPeriod === "AM" && existingHours === 12) existingHours = 0;
        existingBookingDateTime.setUTCHours(existingHours + timezoneOffset, existingMinutes, 0, 0);

        if (bookingDate < existingBookingDateTime) {
            return next(new ApiError("لا يمكنك حجز موعد جديد في وقت قبل حجزك القديم.", 400));
        }
    }

    const visitorId = existingBooking ? existingBooking.visitorId : uuidv4();

    // إنشاء الحجز الجديد في قاعدة البيانات
    const booking = await Booking.create({
        visitorId,
        userName,
        phoneNumber,
        date,
        time,
        type,
        notes
    });

    res.status(201).json({ data: booking });
});




// إضافة عطلة جديدة
// إضافة عطلة جديدة
exports.addHoliday = asyncHandler(async (req, res, next) => {
    const { date, description } = req.body;
    const timezoneOffset = req.timezoneOffset;

    const todayUTC = new Date();
    todayUTC.setUTCHours(todayUTC.getUTCHours() + timezoneOffset, 0, 0, 0); // ضبط الوقت إلى التوقيت المحلي
    const holidayDate = new Date(date);

    // التحقق من أن تاريخ العطلة ليس في الماضي
    if (holidayDate < todayUTC) {
        return next(new ApiError("يجب أن يكون تاريخ العطلة أكبر من أو يساوي التاريخ الحالي", 400));
    }

    // جلب الأيام المحظورة من إعدادات قاعدة البيانات
    const settings = await settingsModel.findOne().lean();
    const forbiddenDays = new Set(settings ? settings.forbiddenDays : []);
    const dayName = holidayDate.toLocaleString('ar-EG', { weekday: 'long' });

    if (forbiddenDays.has(dayName)) {
        return next(new ApiError("لا يمكن إضافة عطلة في أيام العطلات الثابتة", 400));
    }

    // التحقق من عدم وجود عطلة أخرى في نفس التاريخ
    const existingHoliday = await holidayModel.findOne({ date: holidayDate });
    if (existingHoliday) {
        return next(new ApiError("العطلة مضافة بالفعل", 400));
    }

    // التحقق من عدم وجود حجوزات في هذا اليوم
    const existingBookings = await Booking.find({ date: holidayDate });
    if (existingBookings.length > 0) {
        return next(new ApiError("لا يمكن إضافة عطلة في يوم يوجد به مواعيد حجز، برجاء إلغاء المواعيد أولًا", 400));
    }

    const holiday = await holidayModel.create({ date, description });
    res.status(201).json({ data: holiday });
});



// تعديل عطلة
exports.updateHoliday = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { date, description } = req.body;
    const timezoneOffset = req.timezoneOffset;

    const holiday = await holidayModel.findById(id);
    if (!holiday) {
        return next(new ApiError(`لا يوجد عطلة لهذا المعرف: ${id}`, 404));
    }

    if (date) {
        const todayUTC = new Date();
        todayUTC.setUTCHours(todayUTC.getUTCHours() + timezoneOffset, 0, 0, 0);
        const holidayDate = new Date(date);

        if (holidayDate < todayUTC) {
            return next(new ApiError("يجب أن يكون تاريخ العطلة أكبر من أو يساوي التاريخ الحالي", 400));
        }

        const settings = await settingsModel.findOne().lean();
        const forbiddenDays = new Set(settings ? settings.forbiddenDays : []);
        const dayName = holidayDate.toLocaleString('ar-EG', { weekday: 'long' });

        if (forbiddenDays.has(dayName)) {
            return next(new ApiError("لا يمكن تعديل العطلة إلى يوم محظور", 400));
        }

        const existingHoliday = await holidayModel.findOne({ date: holidayDate });
        if (existingHoliday && existingHoliday._id.toString() !== id) {
            return next(new ApiError("العطلة مضافة بالفعل في هذا التاريخ", 400));
        }

        holiday.date = holidayDate;
    }

    if (description) {
        holiday.description = description;
    }

    await holiday.save();
    res.status(200).json({ data: holiday });
});




// الحصول على جميع العطلات
exports.getAllHolidays = asyncHandler(async (req, res) => {
    const holidays = await holidayModel.find();

    const holidaysWithDayNames = holidays.map(holiday => {
        const date = new Date(holiday.date);
        const dayName = date.toLocaleString('ar-EG', { weekday: 'long' });
        return {
            ...holiday.toObject(),
            dayName
        };
    });

    res.status(200).json({ results: holidaysWithDayNames.length, data: holidaysWithDayNames });
});

// حذف عطلة
exports.deleteHoliday = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const holiday = await holidayModel.findByIdAndDelete(id);
    if (!holiday) {
        return next(new ApiError(`No holiday found for this id: ${id}`, 404));
    }

    res.status(204).send();
});

// إلغاء حجز غير ملغى باستخدام معرف الحجز (id)
exports.cancelBooking = asyncHandler(async (req, res, next) => {
    const { id } = req.params; // استخدام معرف الحجز من الرابط
    const booking = await Booking.findOne({ _id: id, isCancelled: false }); // البحث عن الحجز باستخدام id وعدم إلغاءه

    if (!booking) {
        return next(new ApiError(`لا يوجد حجز نشط لهذا المعرف: ${id}`, 404));
    }

    booking.isCancelled = true;
    await booking.save();

    const availableTimes = await getAvailableTimesByDayOfWeek(
        booking.date,
        booking.date.getUTCDay()
    );

    console.log("Available times after cancellation:", availableTimes);

    // تحويل الحقول الزمنية إلى التنسيق "YYYY-MM-DD"
    const formattedBooking = {
        ...booking.toObject(),
        date: new Date(booking.date).toISOString().split('T')[0], // YYYY-MM-DD
        createdAt: new Date(booking.createdAt).toISOString().split('T')[0], // YYYY-MM-DD
        updatedAt: new Date(booking.updatedAt).toISOString().split('T')[0], // YYYY-MM-DD
    };

    res.status(200).json({
        message: "تم إلغاء الحجز بنجاح",
        data: formattedBooking,
        availableTimesAfterCancellation: availableTimes,
    });
});



// الحصول على جميع الحجوزات الحالية فقط
exports.getAllBookings = asyncHandler(async (req, res) => {
    const currentTimeUTC = new Date();
    const currentDateUTC = currentTimeUTC.toISOString().split("T")[0];
    const currentTimeInMinutes = currentTimeUTC.getUTCHours() * 60 + currentTimeUTC.getUTCMinutes();

    const showExpired = req.query.showExpired === 'true';
    const keyword = req.query.keyword;
    const sortBy = req.query.sortBy || 'date'; // حقل الفرز الافتراضي هو `date`
    const order = req.query.order === 'desc' ? -1 : 1; // الترتيب الافتراضي تصاعدي (asc)

    // إعداد التصفية الأساسية للحجوزات
    let filter = { isCancelled: false };

    // إضافة شرط البحث إذا تم توفير `keyword`
    if (keyword) {
        filter.$or = [
            { userName: new RegExp(keyword, 'i') },
            { phoneNumber: new RegExp(keyword, 'i') }
        ];
    }

    // استرجاع جميع الحجوزات بناءً على الشروط
    let allBookings = await Booking.find(filter);

    allBookings = await Promise.all(
        allBookings.map(async booking => {
            const [time, period] = booking.time.split(" ");
            let [hours, minutes] = time.split(":").map(Number);
            if (period === "PM" && hours < 12) hours += 12;
            if (period === "AM" && hours === 12) hours = 0;

            const bookingTimeInMinutes = hours * 60 + minutes;

            // تحويل التاريخ إلى صيغة `YYYY-MM-DD`
            const bookingDate = new Date(booking.date).toLocaleDateString('en-CA'); // صيغة ISO 8601

            if (
                bookingDate < currentDateUTC ||
                (bookingDate === currentDateUTC && bookingTimeInMinutes < currentTimeInMinutes)
            ) {
                booking.isExpired = true;
                await booking.save();
            }

            return {
                ...booking.toObject(),
                bookingDate // التاريخ بالشكل المطلوب
            };
        })
    );

    let filteredBookings = showExpired
        ? allBookings
        : allBookings.filter(booking => !booking.isExpired);
      
    // تعديل الفرز باستخدام `sortBy` و`order`
    filteredBookings.sort((a, b) => {
        if (a[sortBy] === b[sortBy]) {
            return 0;
        }
        return (a[sortBy] > b[sortBy] ? 1 : -1) * order;
    });

    // تطبيق pagination و limit
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // تحديد عدد النتائج بناءً على الصفحة المطلوبة
    const paginatedBookings = filteredBookings.slice(startIndex, endIndex);

    res.status(200).json({
        results: paginatedBookings.length,
        totalResults: filteredBookings.length,
        page,
        totalPages: Math.ceil(filteredBookings.length / limit),
        data: paginatedBookings
    });
});








// الحصول على الحجوزات للمستخدم أو الزائر
exports.getUserOrVisitorBookings = asyncHandler(async (req, res) => {
    const { userId, visitorId, phoneNumber } = req.params;

    // التحقق من وجود مدخلات صالحة
    if (!userId && !visitorId && !phoneNumber) {
        return res.status(400).json({ message: 'يجب توفير userId أو visitorId أو phoneNumber' });
    }

    // إنشاء شرط البحث الأساسي
    const filter = {
        ...(userId && { userId: userId, isCancelled: false }),
        ...(visitorId && { visitorId: visitorId, isCancelled: false }),
        ...(phoneNumber && { phoneNumber: phoneNumber, isCancelled: false }),
    };

    // إضافة فلتر `isExpired` إذا تم تقديمه
    if (req.query.isExpired !== undefined) {
        const isExpired = req.query.isExpired === 'true'; // تحويل النص إلى قيمة Boolean
        filter.isExpired = isExpired;
    }

    // إعداد الصفحة والحد الأقصى للنتائج
    const page = parseInt(req.query.page, 10) || 1; // الصفحة المطلوبة، الافتراضي 1
    const limit = parseInt(req.query.limit, 10) || 25; // عدد الحجوزات في كل صفحة، الافتراضي 25
    const skip = (page - 1) * limit;

    // إعداد الفرز (افتراضيًا حسب التاريخ تصاعديًا)
    const sortBy = req.query.sortBy || 'date'; // حقل الفرز
    const order = req.query.order === 'desc' ? -1 : 1; // الترتيب
    const sort = { [sortBy]: order };

    // جلب الحجوزات باستخدام التصفح والفرز
    const [bookings, totalResults] = await Promise.all([
        Booking.find(filter).skip(skip).limit(limit).sort(sort),
        Booking.countDocuments(filter),
    ]);

    // التحقق من وجود حجوزات
    if (bookings.length === 0) {
        return res.status(404).json({ message: "لا يوجد حجوزات لهذا الزائر." });
    }

    // تنسيق البيانات
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = date.getHours() % 12 || 12;
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
        return `${year}-${month}-${day} ${hours}:${minutes} ${ampm}`;
    };

    const formattedBookings = bookings.map((booking) => ({
        ...booking.toObject(),
        formattedDate: formatDateTime(new Date(booking.date)),
    }));

    // إرسال الرد
    res.status(200).json({
        results: formattedBookings.length,
        totalResults,
        page,
        totalPages: Math.ceil(totalResults / limit),
        data: formattedBookings,
    });
});


// الحصول على جميع الحجوزات الملغية
exports.getCancelledAppointment = asyncHandler(async (req, res) => {
    const showExpired = req.query.showExpired === 'true';
    const keyword = req.query.keyword;
    const sortBy = req.query.sortBy || 'date'; // الحقل المستخدم للفرز، افتراضيًا 'date'
    const order = req.query.order === 'desc' ? -1 : 1; // ترتيب الفرز، افتراضيًا تصاعدي (asc)

    // إعداد التصفية الأساسية للحجوزات الملغية فقط
    let filter = { isCancelled: true };

    // إضافة شرط البحث إذا تم توفير `keyword`
    if (keyword) {
        filter.$or = [
            { userName: new RegExp(keyword, 'i') },
            { phoneNumber: new RegExp(keyword, 'i') }
        ];
    }

    // استرجاع جميع الحجوزات الملغية بناءً على الشروط
    let allCancelledBookings = await Booking.find(filter);

    // فلترة الحجوزات حسب حالة `isExpired` إذا كان `showExpired` محدداً
    let filteredBookings = showExpired
        ? allCancelledBookings
        : allCancelledBookings.filter(booking => !booking.isExpired);

    // ترتيب الحجوزات حسب `sortBy` و`order`
    filteredBookings.sort((a, b) => {
        if (a[sortBy] === b[sortBy]) {
            return 0;
        }
        return (a[sortBy] > b[sortBy] ? 1 : -1) * order;
    });

    // معالجة الصيغة الزمنية
    const formattedBookings = filteredBookings.map(booking => ({
        ...booking.toObject(),
        date: new Date(booking.date).toISOString().split('T')[0], // YYYY-MM-DD
        createdAt: new Date(booking.createdAt).toISOString().split('T')[0], // YYYY-MM-DD
        updatedAt: new Date(booking.updatedAt).toISOString().split('T')[0], // YYYY-MM-DD
    }));

    // التصفح (pagination)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // تحديد عدد النتائج بناءً على الصفحة المطلوبة
    const paginatedBookings = formattedBookings.slice(startIndex, endIndex);

    res.status(200).json({ 
        results: paginatedBookings.length,
        totalResults: formattedBookings.length,
        page,
        totalPages: Math.ceil(formattedBookings.length / limit),
        data: paginatedBookings 
    });
});


// دالة لجلب قيمة timezoneOffset
exports.getTimezoneOffset = asyncHandler(async (req, res, next) => {
    const settings = await settingsModel.findOne().lean();
    
    if (!settings) {
        return next(new ApiError("إعدادات التوقيت غير موجودة", 404));
    }

    // الحصول على الوقت الحالي في UTC
    const currentUTC = new Date();

    // حساب الوقت الحالي لمصر باستخدام timezoneOffset
    const timezoneOffset = settings.timezoneOffset; // مثال: +2
    const currentEgyptTime = new Date(currentUTC.getTime() + timezoneOffset * 60 * 60 * 1000);

    // دالة لتحويل الوقت إلى صيغة واضحة
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // إضافة صفر للأشهر أقل من 10
        const day = String(date.getDate()).padStart(2, '0'); // إضافة صفر للأيام أقل من 10
        const hours = date.getHours() % 12 || 12; // تحويل الساعة لصيغة 12 ساعة
        const minutes = String(date.getMinutes()).padStart(2, '0'); // إضافة صفر للدقائق أقل من 10
        const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
        
        return `${year}-${month}-${day} ${hours}:${minutes} ${ampm}`;
    };

    res.status(200).json({
        timezoneOffset: timezoneOffset,
        currentUTC: formatDateTime(currentUTC), // وقت UTC الحالي بتنسيق yyyy-mm-dd hh:mm AM/PM
        currentEgyptTime: formatDateTime(currentEgyptTime) // وقت مصر الحالي بتنسيق yyyy-mm-dd hh:mm AM/PM
    });
});




// دالة لتحديث قيمة timezoneOffset
exports.updateTimezoneOffset = asyncHandler(async (req, res, next) => {
    const { timezoneOffset } = req.body;

    if (typeof timezoneOffset !== "number") {
        return next(new ApiError("يجب أن يكون timezoneOffset رقمًا", 400));
    }

    const settings = await settingsModel.findOneAndUpdate(
        {},
        { timezoneOffset },
        { new: true, upsert: true }
    ).lean();

    res.status(200).json({
        message: "تم تحديث فرق التوقيت بنجاح",
        timezoneOffset: settings.timezoneOffset
    });
});

