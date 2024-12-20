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

    // التحقق من صحة التاريخ
    if (!date || isNaN(Date.parse(date))) {
        throw new Error(`Invalid date value: ${date}`);
    }

    const workingHours = await WorkingHoursModel.findOne({ dayOfWeek }, 'hours').lean();
    console.log(`Working hours for dayOfWeek ${dayOfWeek}:`, workingHours ? workingHours.hours : "No working hours");

    const bookedTimesArray = (await Booking.find({ date, isCancelled: false }).select('time').lean())
        .map(b => b.time)
        .filter(Boolean);
    console.log(`Booked times for date ${date}:`, bookedTimesArray);

    const nowUTC = new Date();
    nowUTC.setUTCHours(nowUTC.getUTCHours() + timezoneOffset);
    const currentMinutesInUTC = nowUTC.getUTCHours() * 60 + nowUTC.getUTCMinutes();
    console.log(`Current time in UTC minutes: ${currentMinutesInUTC}`);

    const isToday = new Date(date).toISOString().split('T')[0] === nowUTC.toISOString().split('T')[0];
    console.log(`Is today: ${isToday}`);

    const availableTimes = workingHours?.hours?.filter(time => {
        const [timePart, period] = time.split(" ");
        let [hours, minutes] = timePart.split(":").map(Number);
        if (period.toUpperCase() === "PM" && hours < 12) hours += 12;
        if (period.toUpperCase() === "AM" && hours === 12) hours = 0;

        const timeInMinutes = hours * 60 + minutes;

        // تحقق من الأوقات بناءً على اليوم الحالي أو الأيام المستقبلية
        const isValidTime = !isToday || timeInMinutes > currentMinutesInUTC;
        const isNotBooked = !bookedTimesArray.includes(time);

        console.log(`Checking time: ${time}, Time in minutes: ${timeInMinutes}, Valid: ${isValidTime}, Not Booked: ${isNotBooked}`);

        return isValidTime && isNotBooked;
    }) || [];

    console.log(`Final available times for ${date}:`, availableTimes);
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

    // إزالة التكرار من الأوقات المرسلة والتحقق من الصيغة
    const uniqueHours = [...new Set(hours)];
    const validHours = uniqueHours.filter(time => timeFormatRegex.test(time));

    if (validHours.length !== uniqueHours.length) {
        return res.status(400).json({
            message: "بعض الأوقات مكررة أو غير صالحة. يرجى إدخال الأوقات بتنسيق صحيح HH:MM AM/PM."
        });
    }
    

    // البحث عن الساعات الحالية لليوم المحدد
    let existingHours = await WorkingHoursModel.findOne({ dayOfWeek });
    console.log("الساعات الموجودة ليوم:", dayOfWeek, existingHours ? existingHours.hours : "لا توجد ساعات");

    if (existingHours) {
        // دمج الساعات الحالية مع الجديدة مع إزالة التكرار مع تمييز AM و PM
        const combinedHours = [...new Set([...existingHours.hours, ...validHours])];

        // إذا لم يتم إضافة ساعات جديدة، الرد برسالة
        if (combinedHours.length === existingHours.hours.length) {
            return res.status(200).json({
                message: "تم تحديث ساعات العمل، ولا توجد ساعات جديدة مضافة حيث أن الأوقات كانت مكررة."
            });
        }

        existingHours.hours = combinedHours;
        await existingHours.save();
        return res.status(200).json({ message: "تم تحديث ساعات العمل بنجاح.", data: existingHours });
    }

    // إنشاء سجل جديد إذا لم تكن هناك ساعات مسجلة لليوم
    const workingHours = new WorkingHoursModel({ dayOfWeek, hours: validHours });
    await workingHours.save();
    res.status(201).json({ message: "تم إضافة ساعات العمل بنجاح.", data: workingHours });
});

// الحصول على اوقات العمل
exports.getWorkingHours = asyncHandler(async (req, res, next) => {
    try {
        // خريطة لأسماء الأيام
        const dayNames = {
            0: "الأحد",
            1: "الإثنين",
            2: "الثلاثاء",
            3: "الأربعاء",
            4: "الخميس",
            5: "الجمعة",
            6: "السبت"
        };

        // الحصول على كل الأيام وأوقات العمل من قاعدة البيانات
        const workingHours = await WorkingHoursModel.find();

        // إذا لم تكن هناك بيانات، إعادة رسالة فارغة
        if (!workingHours || workingHours.length === 0) {
            return res.status(200).json({
                message: "لا توجد أوقات عمل مسجلة.",
                data: []
            });
        }

        // إضافة dayName لكل سجل
        const workingHoursWithDayNames = workingHours.map(wh => ({
            ...wh.toObject(), // تحويل المستند إلى كائن JavaScript عادي
            dayName: dayNames[wh.dayOfWeek] || "غير معروف"
        }));

        // إعادة البيانات
        res.status(200).json({
            totalResults: workingHoursWithDayNames.length,
            message: "تم الحصول على أوقات العمل بنجاح.",
            data: workingHoursWithDayNames
        });
    } catch (error) {
        next(error);
    }
});



exports.getAvailableDaysWithTimes = async (req, res, next) => {
    try {
        console.log("Starting to fetch available days with times...");

        // استرداد إعدادات الحجز
        const bookingSettings = await settingsModel.findOne().lean();
        const bookingScope = bookingSettings?.bookingScope || 3;
        const forbiddenDays = new Set(bookingSettings?.forbiddenDays || ["الجمعة"]);

        // الحصول على timezoneOffset من الطلب
        const timezoneOffset = req.timezoneOffset;
        if (typeof timezoneOffset !== 'number') {
            console.error("Timezone offset is not set. Please ensure that getTimezoneOffsetMiddleware is used.");
            return next(new ApiError("Timezone offset is not set.", 500));
        }

        // التاريخ الحالي (UTC)
        const nowUTC = new Date();
        console.log("Current UTC Date/Time:", nowUTC);

        // تحويل الوقت الحالي إلى الوقت المحلي
        const nowLocal = new Date(nowUTC.getTime() + timezoneOffset * 60 * 60 * 1000);
        console.log("Current Local Date/Time:", nowLocal);

        // تحويل الوقت الحالي إلى دقائق منذ منتصف الليل Local
        const nowMinutesInLocal = nowLocal.getHours() * 60 + nowLocal.getMinutes();
        console.log("Current Local Time in Minutes:", nowMinutesInLocal);

        // إنشاء تواريخ الأيام التي سيتم التحقق منها في الوقت المحلي
        const datesToCheck = Array.from({ length: bookingScope }, (_, i) => {
            const date = new Date(nowLocal);
            date.setDate(nowLocal.getDate() + i);
            // إعادة ضبط الوقت إلى منتصف الليل
            date.setHours(0, 0, 0, 0);
            return date;
        });

        const datesToCheckStrings = datesToCheck.map(date => date.toISOString().split('T')[0]);
        console.log("Formatted Dates to Check:", datesToCheckStrings);

        console.time("DB queries");

        // استرداد العطلات، ساعات العمل، والأوقات المحجوزة
        const [holidays, workingHours, bookedTimes] = await Promise.all([
            holidayModel.find({ date: { $in: datesToCheckStrings } }).lean(),
            WorkingHoursModel.find({}, 'dayOfWeek hours').lean(),
            Booking.find({
                date: { $in: datesToCheckStrings },
                isCancelled: false
            })
                .select('date time isCancelled')
                .lean(),
        ]);

        console.timeEnd("DB queries");

        console.log("Raw Booked Times from DB:", bookedTimes);

        // معالجة البيانات
        const holidayDates = new Set(holidays.map(holiday => holiday.date.toISOString().split('T')[0]));
        const workingHoursMap = workingHours.reduce((map, wh) => {
            map[wh.dayOfWeek] = wh.hours;
            return map;
        }, {});

        const bookedTimesMap = bookedTimes.reduce((map, booking) => {
            const dateKey = booking.date.toISOString().split('T')[0];
            if (!map[dateKey]) {
                map[dateKey] = {
                    booked: new Set(),
                };
            }
            map[dateKey].booked.add(booking.time);
            return map;
        }, {});

        console.log("Holiday Dates Set:", holidayDates);
        console.log("Working Hours Map:", workingHoursMap);
        console.log("Booked Times Map:", bookedTimesMap);

        // دالة لتحويل الوقت إلى دقائق منذ منتصف الليل
        const timeToMinutes = (time) => {
            // Remove any extra spaces
            time = time.trim();

            // Extract hours, minutes, and period (AM/PM)
            const match = time.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);

            if (!match) {
                console.error(`Invalid time format: ${time}`);
                return null;
            }

            let hours = parseInt(match[1], 10);
            let minutes = parseInt(match[2], 10);
            const period = match[3].toUpperCase();

            if (period === "PM" && hours < 12) hours += 12;
            if (period === "AM" && hours === 12) hours = 0;

            return hours * 60 + minutes;
        };

        // معالجة الأيام للتحقق من الأوقات المتاحة
        const filteredResults = await Promise.all(
            datesToCheck.map(async (currentDate) => {
                const dayOfWeek = currentDate.getDay(); // استخدم getDay() للتوقيت المحلي
                const dateString = currentDate.toISOString().split('T')[0];
                const dayName = currentDate.toLocaleString('ar-EG', { weekday: 'long' });

                // استبعاد الأيام المحظورة والعطلات
                if (forbiddenDays.has(dayName) || holidayDates.has(dateString)) {
                    console.log(`Skipping day: ${dateString} (Reason: Forbidden or Holiday)`);
                    return null;
                }

                const workingHoursForDay = workingHoursMap[dayOfWeek] || [];
                const timesForDay = bookedTimesMap[dateString] || { booked: new Set() };

                const { booked } = timesForDay;

                console.log(`Processing date: ${dateString}`);
                console.log("Working hours for day:", workingHoursForDay);
                console.log("Booked times:", booked);

                // فلترة الأوقات المتاحة
                const availableTimes = workingHoursForDay.filter((time) => {
                    const timeInMinutes = timeToMinutes(time);

                    if (timeInMinutes === null) {
                        console.log(`Skipping invalid time format: ${time}`);
                        return false;
                    }

                    console.log(`Checking time: ${time} (${timeInMinutes} minutes)`);
                    console.log(`Current minutes in Local: ${nowMinutesInLocal}`);

                    // إذا كان الوقت محجوزًا، استبعده
                    if (booked && booked.has(time)) {
                        console.log(`Time ${time} is booked. Excluding.`);
                        return false;
                    }

                    // استبعاد الأوقات التي مضت إذا كان اليوم هو اليوم الحالي
                    const dateStringLocal = currentDate.toISOString().split('T')[0]; // تاريخ اليوم

                    if (dateStringLocal === nowLocal.toISOString().split('T')[0]) {
                        if (timeInMinutes <= nowMinutesInLocal) {
                            console.log(`Time ${time} is in the past or current time. Excluding.`);
                            return false;
                        }
                    }

                    // إذا كان الوقت صالحًا (ليس محجوزًا، وليس في الماضي)
                    return true;
                });

                console.log(`Available times for ${dateString}:`, availableTimes);

                return {
                    date: dateString,
                    dayName,
                    availableTimes,
                };
            })
        );

        const results = filteredResults.filter(day => day !== null);

        console.log("Final available days and times:", results);

        return res.status(200).json({
            results: results.length,
            data: results,
        });

    } catch (error) {
        console.error("Error in getAvailableDaysWithTimes:", error);
        return next(error);
    }
};











// الحصول على اوقات العمل من خلال التاريخ
exports.getAvailableTimesForSpecificDate = asyncHandler(async (req, res, next) => {
    const { date } = req.query; // استلام التاريخ من Query Parameters

    console.log("Received date:", date);
    
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
    const { dayOfWeek, time } = req.body;

    console.log("Received dayOfWeek:", dayOfWeek);
    const dayOfWeekNumber = daysOfWeekMap[dayOfWeek];
    console.log("Mapped dayOfWeekNumber:", dayOfWeekNumber);

    if (dayOfWeekNumber === undefined) {
        return next(new ApiError(`Invalid dayOfWeek name: ${dayOfWeek}. Please provide a valid day name in Arabic.`, 400));
    }

    const workingHours = await WorkingHoursModel.findOne({ dayOfWeek: dayOfWeekNumber });
    console.log(`Working hours for day ${dayOfWeek}:`, workingHours);

    if (!workingHours) {
        return next(new ApiError(`No working hours found for day: ${dayOfWeek}`, 404));
    }

    const validateTimeFormat = (time) => {
        const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])\s?(AM|PM)$/;
        return timeRegex.test(time);
    };

    if (time) {
        console.log(`Attempting to remove time: ${time} from day: ${dayOfWeek}`);
        workingHours.hours = workingHours.hours
            .filter(hour => hour !== time)
            .filter(validateTimeFormat); // تنظيف القائمة

        console.log("Cleaned hours:", workingHours.hours);

        try {
            await workingHours.save();
            console.log(`Time ${time} removed from day ${dayOfWeek}`);
            return res.status(200).json({ 
                status: "success",
                message: `Time ${time} removed from day ${dayOfWeek}` 
            });
        } catch (error) {
            console.error("Error while saving record:", error);
            return next(new ApiError("Failed to save updated working hours.", 500));
        }
    }

    console.log(`Attempting to remove all times for day: ${dayOfWeek}`);
    workingHours.hours = [];

    try {
        await workingHours.save();
        console.log(`All times removed for day ${dayOfWeek}`);
        return res.status(200).json({
            status: "success",
            message: `All working hours removed for day ${dayOfWeek}` 
        });
    } catch (error) {
        console.error("Error while saving record:", error);
        return next(new ApiError("Failed to save updated working hours.", 500));
    }
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
        return next(new ApiError("يجب أن ادراج الوقت القديم والجديد معًا", 400));
    }

    // تحقق من صحة تنسيق oldTime و newTime باستخدام regex
    const timeFormatRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
    if (!timeFormatRegex.test(oldTime) || !timeFormatRegex.test(newTime)) {
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

    // التحقق مما إذا كان الوقت الجديد موجوداً بالفعل
    if (workingHours.hours.includes(newTime)) {
        return next(new ApiError(`الوقت الجديد ${newTime} موجود بالفعل في قائمة ساعات العمل.`, 400));
    }

    // استبدال الوقت القديم بالوقت الجديد
    workingHours.hours[timeIndex] = newTime;
    await workingHours.save(); // حفظ التعديلات

    res.status(200).json({ 
        message: `تم تحديث الوقت من ${oldTime} إلى ${newTime} لليوم ${dayOfWeek}`, 
        data: workingHours 
    });
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
exports.updateForbiddenDays = asyncHandler(async (req, res,next) => {
    const { forbiddenDays } = req.body;
    if (!Array.isArray(forbiddenDays)) {
        return res.status(400).json({ message: "يجب أن تكون العطلات الثابتة مصفوفة []" });
    }

    const validDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const invalidDays = forbiddenDays.filter(day => !validDays.includes(day));
    if (invalidDays.length > 0) {
        return res.status(400).json({ message: `الأيام التالية غير صحيحة: ${invalidDays.join(', ')}` });
    }

  // التحقق من وجود حجوزات في الأيام المحددة كعطلات
  for (const day of forbiddenDays) {
    const dayIndex = validDays.indexOf(day); // تحديد الرقم المقابل لليوم

    // إنشاء نسخة جديدة من اليوم الحالي
    const today = new Date();
    const startOfDay = new Date(today); // نسخ التاريخ الحالي
    const endOfDay = new Date(today); // نسخ التاريخ الحالي

    // حساب بداية اليوم
    startOfDay.setDate(today.getDate() - today.getDay() + dayIndex);
    startOfDay.setHours(0, 0, 0, 0); // بداية اليوم الساعة 00:00:00

    // حساب نهاية اليوم
    endOfDay.setDate(today.getDate() - today.getDay() + dayIndex);
    endOfDay.setHours(23, 59, 59, 999); // نهاية اليوم الساعة 23:59:59

    // البحث عن الحجوزات في هذا اليوم باستخدام النطاق الكامل بين بداية ونهاية اليوم
    const existingBookings = await Booking.find({
        date: { $gte: startOfDay, $lte: endOfDay }, // البحث ضمن النطاق الكامل لليوم
    });

    // إذا كانت هناك حجوزات في هذا اليوم، يتم إرجاع رسالة خطأ
    if (existingBookings.length > 0) {
        return next(new ApiError(`لا يمكن إضافة عطلة في يوم ${day} حيث توجد حجوزات بالفعل، برجاء إلغاء المواعيد أولًا`, 400));
    }
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
    const { userName, phoneNumber, date, time, type, notes, visitorId } = req.body;
    const timezoneOffset = req.timezoneOffset || 0;

        // التحقق من دور المستخدم
        const isRoleExempted = (user) => {
            return user && (user.role === 'admin' || user.role === 'manager');
        };

        
        if (isRoleExempted(req.user)) {
            console.log("Admin or Manager role detected. Skipping previous booking checks.");
        } else {
            // التحقق من الحجوزات السابقة
            const filter = visitorId
                ? { visitorId, isCancelled: false } // البحث عن الحجوزات السابقة للزائر
                : req.user
                ? { userId: req.user._id, isCancelled: false } // البحث عن الحجوزات السابقة للمستخدم
                : null;
    
            if (filter) {
                const latestBooking = await Booking.findOne(filter).sort({ date: -1, time: -1 }).lean();
                if (latestBooking) {
                    const lastBookingDate = new Date(latestBooking.date);
                    const [lastTimePart, lastPeriod] = latestBooking.time.split(" ");
                    let [lastHours, lastMinutes] = lastTimePart.split(":").map(Number);
                    if (lastPeriod === "PM" && lastHours < 12) lastHours += 12;
                    if (lastPeriod === "AM" && lastHours === 12) lastHours = 0;
                    lastBookingDate.setUTCHours(lastHours, lastMinutes, 0, 0);
    
                    const bookingDate = new Date(date);
                    const [timePart, period] = time.split(" ");
                    let [hours, minutes] = timePart.split(":").map(Number);
                    if (period === "PM" && hours < 12) hours += 12;
                    if (period === "AM" && hours === 12) hours = 0;
                    bookingDate.setUTCHours(hours, minutes, 0, 0);
    
                    if (lastBookingDate.toDateString() === bookingDate.toDateString() && bookingDate <= lastBookingDate) {
                        console.error("Booking date is before or equal to the latest booking on the same day.");
                        return next(new ApiError("لا يمكن حجز موعد جديد قبل أو بنفس وقت الحجز السابق في نفس اليوم.", 400));
                    }
                }
            }
        }

        // التحقق من صحة النوع (type) مع إعدادات النظام
        const settingsType = await settingsModel.findOne();
        if (!settingsType) {
            return next(new ApiError("Type not found. Please contact the administrator.", 500));
        }
    
        if (!settingsType.types.includes(type)) {
            return next(new ApiError(`Invalid type. Allowed types are: ${settingsType.types.join(", ")}`, 400));
        }

    // 1. تحديد الوقت الحالي UTC
    const currentUTC = new Date();
    currentUTC.setUTCHours(currentUTC.getUTCHours() + timezoneOffset);
    console.log("Current UTC Time:", currentUTC.toISOString());

    // 2. حساب التاريخ والوقت المطلوب للحجز
    const bookingDate = new Date(date);
    const [timePart, period] = time.split(" ");
    let [hours, minutes] = timePart.split(":").map(Number);
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    bookingDate.setUTCHours(hours, minutes, 0, 0);
    console.log("Booking Date and Time:", bookingDate.toISOString());

    // 3. التحقق من أن الحجز الجديد أكبر من الوقت الحالي UTC
    if (bookingDate <= currentUTC) {
        console.error("Booking date is in the past or current time.");
        return next(new ApiError("لا يمكن حجز موعد في الماضي أو الوقت الحالي. يرجى اختيار موعد مستقبلي.", 400));
    }

    // 4. التحقق من الحجوزات السابقة إذا كان الزائر موجودًا
    const filter = visitorId
        ? { visitorId, isCancelled: false } // البحث عن الحجوزات إذا كان visitorId موجودًا
        : null; // لا يوجد حجز سابق

    let latestBooking = null;

    if (filter) {
        latestBooking = await Booking.findOne(filter).sort({ date: -1, time: -1 }).lean();
    }

    console.log("Latest Booking:", latestBooking);

    if (latestBooking) {
        // تحويل التاريخ والوقت للحجز الأخير إلى UTC
        const lastBookingDate = new Date(latestBooking.date);
        const [lastTimePart, lastPeriod] = latestBooking.time.split(" ");
        let [lastHours, lastMinutes] = lastTimePart.split(":").map(Number);
        if (lastPeriod === "PM" && lastHours < 12) lastHours += 12;
        if (lastPeriod === "AM" && lastHours === 12) lastHours = 0;
        lastBookingDate.setUTCHours(lastHours, lastMinutes, 0, 0);
        console.log("Last Booking Date and Time:", lastBookingDate.toISOString());

        // السماح بحجز جديد في نفس اليوم طالما أن الوقت الجديد أكبر من وقت الحجز السابق
        if (lastBookingDate.toDateString() === bookingDate.toDateString() && bookingDate <= lastBookingDate) {
            console.error("Booking date is before or equal to the latest booking on the same day.");
            return next(new ApiError("لا يمكن حجز موعد جديد قبل أو بنفس وقت الحجز السابق في نفس اليوم.", 400));
        }
    }

    // 5. التحقق من الأوقات المتاحة

    
// 5. التحقق من الأوقات المتاحة

// أولاً، البحث عن حجز ملغى لنفس التاريخ والوقت وللزائر أو المستخدم نفسه

let existingCancelledBooking = null; // تعريف المتغير هنا

if (existingCancelledBooking) {
    // إعادة تفعيل الحجز الملغى
    existingCancelledBooking.isCancelled = false;

    // تحديث الحقول الأخرى إذا تم إرسالها
    if (req.body.userName) {
        existingCancelledBooking.userName = req.body.userName;
    }

    if (req.body.phoneNumber) {
        existingCancelledBooking.phoneNumber = req.body.phoneNumber;
    }

    if (req.body.type) {
        existingCancelledBooking.type = req.body.type;
    }

    if (req.body.notes) {
        existingCancelledBooking.notes = req.body.notes;
    }

    await existingCancelledBooking.save(); // حفظ التعديلات في قاعدة البيانات

    console.log("Reactivated Booking with updates:", existingCancelledBooking);

    return res.status(200).json({
        status: "Success",
        message: "تم إعادة تفعيل الحجز بنجاح.",
        data: existingCancelledBooking,
        isOldBooked: true,
    });
}


  // أولاً، البحث عن حجز ملغى لنفس التاريخ والوقت
//   let existingCancelledBooking = await Booking.findOne({ date, time, isCancelled: true }).lean();

//   if (existingCancelledBooking) {
//       // إعادة تفعيل الحجز الملغى
//       await Booking.updateOne({ _id: existingCancelledBooking._id }, { isCancelled: false });
//       const reactivatedBooking = await Booking.findById(existingCancelledBooking._id).lean();
//       console.log("Reactivated Booking:", reactivatedBooking);

//       return res.status(200).json({
//           status: "Success",
//           message: "تم إعادة تفعيل الحجز بنجاح.",
//           data: reactivatedBooking,
//       });
//   }

const bookedTimes = await Booking.find({ date, time }).lean();
console.log("Booked Times for date and time:", bookedTimes);

// السماح بالحجز إذا لم يكن هناك حجوزات غير ملغاة
const isTimeAvailable = bookedTimes.every((booking) => booking.isCancelled);

console.log("Final Time Availability Check:", {
    allCancelled: bookedTimes.every((booking) => booking.isCancelled),
    noBookings: bookedTimes.length === 0,
    isTimeAvailable,
});

// التحقق من توفر الوقت
if (!isTimeAvailable) {
    console.error("Time is not available for booking.");
    return next(new ApiError("الوقت المطلوب غير متاح للحجز. يرجى اختيار وقت آخر.", 400));
}



// التحقق من الأوقات المتاحة بناءً على ساعات العمل
const dayOfWeek = bookingDate.getUTCDay();
const availableTimes = await getAvailableTimesByDayOfWeek(date, dayOfWeek, timezoneOffset);

if (!availableTimes.includes(time)) {
    console.error("Time is not available based on working hours.");
    return next(new ApiError("الوقت المطلوب غير متاح للحجز. يرجى اختيار وقت آخر.", 400));
}


    // 6. إنشاء الحجز الجديد
    // visitorId: visitorId || uuidv4(), // إذا لم يكن هناك visitorId، يتم توليد واحد جديد
    const newBooking = await Booking.create({
        visitorId: req.user ? null : (visitorId || uuidv4()), // تعيين null إذا كان الحجز بواسطة مستخدم مسجل
        userId: req.user ? req.user._id : null,
        userName,
        phoneNumber,
        date,
        time,
        type,
        notes,
    });

    console.log("New Booking Created:", newBooking);
    res.status(201).json({
        status:"Success",
        message: "تم إنشاء الحجز بنجاح.",
        data: newBooking,
    });
});



// الحصول على قائمة الأنواع
exports.getTypes = asyncHandler(async (req, res) => {
    const settings = await settingsModel.findOne();
    if (!settings) {
        return res.status(404).json({ message: "Settings not found" });
    }
    res.status(200).json({ types: settings.types });
});

// اضافة نوع الحجز

exports.addType = asyncHandler(async (req, res) => {
    const { type } = req.body;

    if (!type || typeof type !== "string" || type.length < 2 || type.length > 30) {
        return res.status(400).json({ message: "Type must be a string between 2 and 30 characters" });
    }

    const settings = await settingsModel.findOne();
    if (!settings) {
        return res.status(404).json({ message: "Settings not found" });
    }

    if (settings.types.includes(type)) {
        return res.status(400).json({ message: "Type already exists" });
    }

    settings.types.push(type);
    await settings.save();

    res.status(201).json({ message: "Type added successfully", types: settings.types });
});

// تعديل انواع الحجز
exports.updateType = asyncHandler(async (req, res) => {
    const { oldType, newType } = req.body;

    if (!newType || typeof newType !== "string" || newType.length < 2 || newType.length > 30) {
        return res.status(400).json({ message: "New type must be a string between 2 and 30 characters" });
    }

    const settings = await settingsModel.findOne();
    if (!settings) {
        return res.status(404).json({ message: "Settings not found" });
    }

    const index = settings.types.indexOf(oldType);
    if (index === -1) {
        return res.status(404).json({ message: "Old type not found" });
    }

    settings.types[index] = newType;
    await settings.save();

    res.status(200).json({ message: "Type updated successfully", types: settings.types });
});

// حذف نوع الحجز
exports.deleteType = asyncHandler(async (req, res) => {
    const { type } = req.body;

    const settings = await settingsModel.findOne();
    if (!settings) {
        return res.status(404).json({ message: "Settings not found" });
    }

    const index = settings.types.indexOf(type);
    if (index === -1) {
        return res.status(404).json({ message: "Type not found" });
    }

    settings.types.splice(index, 1);
    await settings.save();

    res.status(200).json({ message: "Type deleted successfully", types: settings.types });
});


// الحصول على إعدادات النظام
exports.getSettings = asyncHandler(async (req, res, next) => {
    const settings = await settingsModel.findOne();
    if (!settings) {
        return res.status(404).json({ message: "Settings not found" });
    }
    res.status(200).json(settings);
});

// تحديث وضع الصيانة والرسالة
exports.updateMaintenanceMode = asyncHandler(async (req, res, next) => {
    const { maintenanceMode, maintenanceMessage } = req.body;

    // التحقق من عدد الكلمات وعدد الأحرف
    if (maintenanceMessage) {
        const wordCount = maintenanceMessage.trim().split(/\s+/).length; // عد الكلمات
        const charCount = maintenanceMessage.length; // عد الأحرف

        if (wordCount > 100) {
            return res.status(400).json({
                message: "Maintenance message must not exceed 100 words.",
            });
        }

        if (charCount > 200) {
            return res.status(400).json({
                message: "Maintenance message must not exceed 200 characters.",
            });
        }
    }

    // تحديث الإعدادات في قاعدة البيانات
    const updatedSettings = await settingsModel.findOneAndUpdate(
        {},
        { maintenanceMode, maintenanceMessage },
        { new: true, upsert: true }
    ).select("maintenanceMode maintenanceMessage");

    res.status(200).json({
        message: "Maintenance mode updated successfully",
        data: updatedSettings,
    });
});


// تحديث نص الأدمن في فورم الحجز
exports.updateAdminMessage = asyncHandler(async (req, res, next) => {
    const { adminMessage } = req.body;

    if (adminMessage.length > 200) {
        return res.status(400).json({
            message: "Admin message must not exceed 200 characters",
        });
    }

    const updatedSettings = await settingsModel.findOneAndUpdate(
        {},
        { adminMessage },
        { new: true, upsert: true }
    ).select("adminMessage");;

    res.status(200).json({
        message: "Admin message updated successfully",
        data: updatedSettings,
    });
});

// تحديث أرقام الهاتف والواتساب
exports.updateContactNumbers = asyncHandler(async (req, res, next) => {
    const { phoneNumber, whatsappNumber } = req.body;

    // التحقق من صحة الأرقام
    const phoneRegex = /^\d{11}$/;
    if (
        (phoneNumber && !phoneRegex.test(phoneNumber)) ||
        (whatsappNumber && !phoneRegex.test(whatsappNumber))
    ) {
        return res.status(400).json({
            message: "Phone number and WhatsApp number must contain exactly 11 digits",
        });
    }

    const updatedSettings = await settingsModel.findOneAndUpdate(
        {},
        { phoneNumber, whatsappNumber },
        { new: true, upsert: true }
    ).select("phoneNumber whatsappNumber");;

    res.status(200).json({
        message: "Contact numbers updated successfully",
        data: updatedSettings,
    });
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
    const { id } = req.params;
    const booking = await Booking.findOne({ _id: id, isCancelled: false });

    if (!booking) {
        return next(new ApiError(`لا يوجد حجز نشط لهذا المعرف: ${id}`, 404));
    }

    booking.isCancelled = true;
    await booking.save();

    // التحقق من صحة التاريخ
    const bookingDate = booking.date;
    if (!bookingDate || isNaN(Date.parse(bookingDate))) {
        return next(new ApiError("Invalid booking date value.", 400));
    }

    const availableTimes = await getAvailableTimesByDayOfWeek(
        bookingDate.toISOString().split('T')[0],
        bookingDate.getUTCDay(),
        0 // استخدم إزاحة التوقيت المناسبة
    );

    console.log("Available times after cancellation:", availableTimes);

    const formattedBooking = {
        ...booking.toObject(),
        date: booking.date.toISOString().split('T')[0], // YYYY-MM-DD
        createdAt: booking.createdAt.toISOString().split('T')[0], // YYYY-MM-DD
        updatedAt: booking.updatedAt.toISOString().split('T')[0], // YYYY-MM-DD
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
    const currentDateUTC = currentTimeUTC.toISOString().split("T")[0]; // تاريخ اليوم بصيغة YYYY-MM-DD
    const currentTimeInMinutes = currentTimeUTC.getUTCHours() * 60 + currentTimeUTC.getUTCMinutes();

    const showExpired = req.query.showExpired === 'true';
    const showCancelled = req.query.showCancelled === 'true'; // فلتر لإظهار الحجوزات الملغية
    const keyword = req.query.keyword;
    const today = req.query.today === 'true'; // فلترة حجوزات اليوم فقط
    const filterType = req.query.filterType; // نوع الفلترة (today, thisWeek, thisMonth, specificDay)
    const specificDate = req.query.specificDate; // تاريخ معين
    const sortBy = req.query.sortBy || 'date'; // حقل الفرز الافتراضي هو `date`
    const order = req.query.order === 'desc' ? -1 : 1; // الترتيب الافتراضي تصاعدي (asc)

    // إعداد التصفية الأساسية للحجوزات
    let filter = {};

    // التحقق من إظهار الحجوزات الملغية
    if (showCancelled) {
        filter.isCancelled = true; // تضمين الحجوزات الملغية فقط
    } else {
        filter.isCancelled = false; // استبعاد الحجوزات الملغية
    }

    // الفلاتر الخاصة بـ filterType
    if (filterType === 'today' || today) {
        filter.date = {
            $gte: new Date(currentDateUTC),
            $lt: new Date(currentDateUTC + 'T23:59:59.999Z')
        };
    } else if (filterType === 'thisWeek') {
        const startOfWeek = new Date(currentTimeUTC);
        startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);

        filter.date = {
            $gte: startOfWeek,
            $lt: new Date(endOfWeek.getTime() + 24 * 60 * 60 * 1000)
        };
    } else if (filterType === 'thisMonth') {
        const startOfMonth = new Date(currentTimeUTC);
        startOfMonth.setUTCDate(1);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setUTCMonth(startOfMonth.getUTCMonth() + 1);

        filter.date = {
            $gte: startOfMonth,
            $lt: endOfMonth
        };
    } else if (filterType === 'specificDay' && specificDate) {
        const date = new Date(specificDate);
        filter.date = {
            $gte: date,
            $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000)
        };
    }

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

    let filteredBookings;

    // إذا كانت الحجوزات الملغية مطلوبة، لا نهتم بـ `isExpired`
    if (showCancelled) {
        filteredBookings = allBookings; // عرض كل الحجوزات الملغية سواء منتهية أو سارية
    } else {
        filteredBookings = showExpired
            ? allBookings
            : allBookings.filter(booking => !booking.isExpired); // فلترة الحجوزات بناءً على حالة `isExpired`
    }

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
    const { userId, visitorId, phoneNumber } = req.params; // قراءة من params

    // التحقق من وجود المدخلات
    if (!userId && !visitorId && !phoneNumber) {
        return res.status(400).json({ message: 'يجب توفير userId أو visitorId أو phoneNumber' });
    }


// قراءة الفلتر المتعلق بالحجوزات الملغاة
const { canceled } = req.query;

// إنشاء شرط البحث مع دعم الفلتر الخاص بالحجوزات الملغاة
const filter = {
    ...(userId && { userId }),
    ...(visitorId && { visitorId }),
    ...(phoneNumber && { phoneNumber }),
    ...(canceled !== undefined && canceled !== '' && { isCancelled: canceled === 'true' }), // نتحقق أن القيمة ليست فارغة أو غير معرفة
};


    // إعداد الصفحة والحد الأقصى للنتائج
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const skip = (page - 1) * limit;

    // إعداد الفرز
    const sortBy = req.query.sortBy || 'date';
    const order = req.query.order === 'desc' ? -1 : 1;
    const sort = { [sortBy]: order };

    // البحث في قاعدة البيانات
    const [bookings, totalResults] = await Promise.all([
        Booking.find(filter).skip(skip).limit(limit).sort(sort),
        Booking.countDocuments(filter),
    ]);

    // التحقق من وجود نتائج
    if (bookings.length === 0) {
        return res.status(404).json({ message: 'لا يوجد حجوزات لهذا العميل.' });
    }

    // إرسال النتائج
    res.status(200).json({
        results: bookings.length,
        totalResults,
        page,
        totalPages: Math.ceil(totalResults / limit),
        data: bookings,
    });
});


// الحصول على حجز معين لزائر او يوزر معين او الحصول على حجز بال id
exports.getSpecificBookingByVisitorOrUser = asyncHandler(async (req, res, next) => {
    const { bookingId, visitorId, userId } = req.params;

    // التحقق من تقديم bookingId وواحد من visitorId أو userId
    if (!bookingId || (!visitorId && !userId)) {
        return res.status(400).json({
            message: "يجب تقديم bookingId و visitorId أو userId.",
        });
    }

    // إنشاء شروط البحث
    const filter = { _id: bookingId };
    if (visitorId) filter.visitorId = visitorId;
    if (userId) filter.userId = userId;

    // البحث عن الحجز
    const booking = await Booking.findOne(filter);

    if (!booking) {
        return next(new ApiError("لا يوجد حجز يطابق المعايير المقدمة.", 404));
    }

    // التحقق من انتهاء الحجز وتحديث `isExpired` إذا لزم الأمر
    const currentTimeUTC = new Date();
    const currentDateUTC = currentTimeUTC.toISOString().split("T")[0]; // تاريخ اليوم بصيغة YYYY-MM-DD
    const currentTimeInMinutes = currentTimeUTC.getUTCHours() * 60 + currentTimeUTC.getUTCMinutes();

    // تحويل وقت الحجز إلى دقائق
    const [time, period] = booking.time.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    const bookingTimeInMinutes = hours * 60 + minutes;
    const bookingDate = new Date(booking.date).toISOString().split("T")[0];

    // تحقق من انتهاء الحجز
    if (
        bookingDate < currentDateUTC || 
        (bookingDate === currentDateUTC && bookingTimeInMinutes < currentTimeInMinutes)
    ) {
        if (!booking.isExpired) { // تحديث فقط إذا لم يكن منتهيًا مسبقًا
            booking.isExpired = true;
            await booking.save(); // حفظ التحديث في قاعدة البيانات
            console.log(`Booking ${bookingId} marked as expired.`);
        }
    }

    // إرسال الحجز في الرد
    res.status(200).json({
        status: "success",
        data: booking,
    });
});







exports.getAllVisitor = asyncHandler(async (req, res, next) => {
    const { keyword = "", sort = "", page = 1, limit = 10 } = req.query;

    // تحديد متغيرات التصفية والترتيب
    const matchConditions = {
        userId: null, // الحجوزات التي لا ترتبط بمستخدم مسجل
        visitorId: { $exists: true, $ne: null }, // يجب أن يكون visitorId موجودًا
    };

    // إذا كان هناك كلمة مفتاحية للبحث (بحث حسب الاسم أو الهاتف)
    if (keyword) {
        const regex = new RegExp(keyword, "i"); // استخدام تعبير منتظم للبحث الغير حساس لحالة الحروف
        matchConditions.$or = [
            { "userName": { $regex: regex } },
            { "phoneNumber": { $regex: regex } },
        ];
    }

    // تحديد الترتيب (تصاعدي أو تنازلي حسب تاريخ الحجز)
    const sortConditions = sort
        ? { "date": sort === "createdAt" ? 1 : -1 } // 1 للتصاعدي، -1 للتنازلي
        : { "date": 1 }; // الافتراضي تصاعدي حسب تاريخ الحجز

    // حساب مقدار الترحيل بناءً على الصفحة والعدد المحدد في الـ query
    const skip = (page - 1) * limit;

    // استعلام MongoDB مع التصفيه والفرز والتقسيم إلى صفحات
    const visitors = await Booking.aggregate([
        {
            $match: matchConditions,  // تطبيق التصفيات
        },
        {
            $group: {
                _id: "$visitorId", // تجميع الزوار حسب visitorId
                visitorInfo: { $first: "$$ROOT" }, // الحصول على أول وثيقة تحتوي على تفاصيل الزائر
            },
        },
        {
            $project: {
                _id: 0, // إزالة الحقل _id من الرد النهائي
                visitorId: "$_id",
                userName: "$visitorInfo.userName",
                phoneNumber: "$visitorInfo.phoneNumber",
                // إضافة تاريخ الحجز بصيغة dd-mm-yyyy داخل visitorInfo
                bookingDate: {
                    $dateToString: {
                        format: "%d-%m-%Y", // التنسيق المطلوب
                        date: "$visitorInfo.date",  // استخدام تاريخ الحجز
                    },
                },
            },
        },
        {
            $sort: sortConditions, // ترتيب البيانات حسب تاريخ الحجز
        },
        {
            $skip: skip, // تخطي البيانات السابقة بناءً على الصفحة
        },
        {
            $limit: parseInt(limit), // تحديد عدد العناصر في الصفحة
        },
    ]);

    // حساب إجمالي عدد الزوار بدون تقسيم الصفحات
    const totalCount = await Booking.aggregate([
        {
            $match: matchConditions, // تطبيق التصفيات
        },
        {
            $group: {
                _id: "$visitorId", // تجميع الزوار حسب visitorId
            },
        },
        {
            $count: "totalCount", // حساب العدد الإجمالي
        },
    ]);

    const totalPages = totalCount.length > 0 ? Math.ceil(totalCount[0].totalCount / limit) : 0;

    // الرد بالزوار مع التاريخ المحول داخل visitorInfo
    res.status(200).json({
        status: "success",
        results: visitors.length,
        totalCount: totalCount.length > 0 ? totalCount[0].totalCount : 0,
        totalPages,
        currentPage: page,
        data: visitors,
    });
});






// الحصول على جميع الحجوزات الملغية
exports.getCancelledAppointment = asyncHandler(async (req, res) => {
    const showExpired = req.query.showExpired === 'true';
    const keyword = req.query.keyword;
    const sortBy = req.query.sortBy || 'date'; // الحقل المستخدم للفرز، افتراضيًا 'date'
    const order = req.query.order === 'desc' ? -1 : 1; // ترتيب الفرز، افتراضيًا تصاعدي (asc)
    const filterType = req.query.filterType; // اليوم أو الأسبوع أو الشهر
    const specificDate = req.query.specificDate; // يوم معين

    // إعداد التصفية الأساسية للحجوزات الملغية فقط
    let filter = { isCancelled: true };

    // إضافة شرط البحث إذا تم توفير `keyword`
    if (keyword) {
        filter.$or = [
            { userName: new RegExp(keyword, 'i') },
            { phoneNumber: new RegExp(keyword, 'i') }
        ];
    }

    // الحصول على التاريخ الحالي
    const now = new Date();
    const currentDate = new Date(now.toISOString().split("T")[0]); // بداية اليوم الحالي

    // تطبيق فلاتر اليوم/الأسبوع/الشهر/يوم معين
    if (filterType === 'today') {
        filter.date = {
            $gte: currentDate,
            $lt: new Date(currentDate.getTime() + 24 * 60 * 60 * 1000) // اليوم التالي
        };
    } else if (filterType === 'thisWeek') {
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay()); // بداية الأسبوع
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7); // نهاية الأسبوع

        filter.date = {
            $gte: startOfWeek,
            $lt: endOfWeek
        };
    } else if (filterType === 'thisMonth') {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); // بداية الشهر
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1); // بداية الشهر التالي

        filter.date = {
            $gte: startOfMonth,
            $lt: endOfMonth
        };
    } else if (filterType === 'specificDay' && specificDate) {
        const specificDay = new Date(specificDate);
        const startOfDay = new Date(specificDay);
        startOfDay.setHours(0, 0, 0, 0); // بداية اليوم
        const endOfDay = new Date(startOfDay);
        endOfDay.setHours(23, 59, 59, 999); // نهاية اليوم

        filter.date = {
            $gte: startOfDay,
            $lt: endOfDay
        };
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

