const asyncHandler = require("express-async-handler");
const Booking = require("../models/bookingModel");
const ApiError = require("../utils/apiError");
const holidayModel = require("../models/holidayModel");
const WorkingHoursModel = require('../models/workHoursModel');
const settingsModel = require("../models/settingsModel");
const { v4: uuidv4 } = require('uuid');

// استرجاع الأوقات المتاحة لليوم المحدد بناءً على يوم الأسبوع واستبعاد الأوقات المحجوزة
async function getAvailableTimesByDayOfWeek(date, dayOfWeek) {
    console.log(`Getting available times for date: ${date} (dayOfWeek: ${dayOfWeek})`);

    const workingHours = await WorkingHoursModel.findOne({ dayOfWeek });
    console.log("Working hours retrieved from DB:", workingHours.hours);

    const bookedTimes = await Booking.find({ date, isCancelled: false }).select('time'); // تأكد من استبعاد الحجوزات الملغاة
    const bookedTimesArray = bookedTimes.map(b => b.time);
    console.log("Booked times for this date:", bookedTimesArray);

    const availableTimes = workingHours.hours.filter(time => !bookedTimesArray.includes(time));
    console.log("Calculated available times:", availableTimes);

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

    // استخدام Regular Expression للتحقق من صيغة الأوقات المدخلة
    const timeFormatRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
    const validHours = hours.filter(time => timeFormatRegex.test(time));

    if (validHours.length !== hours.length) {
        return res.status(400).json({
            message: "بعض الأوقات غير صالحة. يرجى إدخال الأوقات بتنسيق صحيح HH:MM AM/PM."
        });
    }

    // جلب الساعات الموجودة لليوم المعني وإزالة التكرارات
    let existingHours = await WorkingHoursModel.findOne({ dayOfWeek });
    console.log("الساعات الموجودة ليوم:", dayOfWeek, existingHours ? existingHours.hours : "لا توجد ساعات");

    if (existingHours) {
        // دمج الساعات الجديدة مع الساعات الموجودة واستبعاد التكرار
        existingHours.hours = [...new Set([...existingHours.hours, ...validHours])];
        await existingHours.save();
        return res.status(200).json({ message: "تم تحديث ساعات العمل بنجاح." });
    }

    // إذا لم توجد ساعات لهذا اليوم مسبقًا، قم بإنشائها
    const workingHours = new WorkingHoursModel({ dayOfWeek, hours: validHours });
    await workingHours.save();
    res.status(201).json({ message: "تم إضافة ساعات العمل بنجاح." });
});

exports.getAvailableDaysWithTimes = async (req, res, next) => {
    try {
        console.log("Start: getAvailableDaysWithTimes");

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

        const [holidays, workingHours, bookedTimes] = await Promise.all([
            holidayModel.find({ date: { $in: datesToCheck } }).lean(),
            WorkingHoursModel.find({}).lean(),
            Booking.find({ date: { $in: datesToCheck }, isCancelled: false }).select('date time').lean()
        ]);

        console.log("Holidays:", holidays);
        console.log("Working hours:", workingHours);
        console.log("Booked times:", bookedTimes);

        const holidayDates = new Set(holidays.map(holiday => holiday.date.toISOString().split('T')[0]));

        const workingHoursMap = workingHours.reduce((map, wh) => {
            map[wh.dayOfWeek] = wh.hours;
            return map;
        }, {});
        console.log("Working Hours Map:", workingHoursMap);

        const bookedTimesMap = bookedTimes.reduce((map, booking) => {
            const dateKey = booking.date.toISOString().split('T')[0];
            if (!map[dateKey]) {
                map[dateKey] = new Set();
            }
            map[dateKey].add(booking.time);
            return map;
        }, {});
        console.log("Booked Times Map:", bookedTimesMap);

        const daysPromises = datesToCheck.map(async (currentDate) => {
            const dayOfWeek = currentDate.getDay();
            const dateString = currentDate.toISOString().split('T')[0];
            const dayName = currentDate.toLocaleString('ar-EG', { weekday: 'long' });

            console.log(`Processing date: ${dateString} (${dayName})`);

            if (!forbiddenDays.has(dayName) && !holidayDates.has(dateString)) {
                const workingHoursForDay = workingHoursMap[dayOfWeek] || [];
                const bookedTimesForDay = bookedTimesMap[dateString] || new Set();

                console.log(`Working hours for ${dayName} (${dateString}):`, workingHoursForDay);
                console.log(`Booked times for ${dayName} (${dateString}):`, Array.from(bookedTimesForDay));

                // Filter out booked times
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
            next(error);
        }
    }
};









// حذف ساعات العمل
exports.deleteWorkingHours = asyncHandler(async (req, res, next) => {
    const { dayOfWeek } = req.params;
    const result = await WorkingHoursModel.findOneAndDelete({ dayOfWeek });
    if (!result) {
        return next(new ApiError(`No working hours found for this day: ${dayOfWeek}`, 404));
    }
    res.status(204).send();
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
        { new: true, upsert: true } // upsert لإنشاء السجل في حال عدم وجوده
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
// إنشاء حجز جديد
// إنشاء حجز جديد مع التأكد من تحديث قاعدة البيانات بشكل صحيح
exports.createBooking = asyncHandler(async (req, res, next) => {
    const { userName, phoneNumber, date, time, type, notes } = req.body;
    console.log(`Attempting to create booking on ${date} at ${time} for ${userName}`);

    // تحويل التاريخ والوقت المدخل إلى كائن Date
    const bookingDate = new Date(date);
    const [timePart, period] = time.split(" ");
    let [hours, minutes] = timePart.split(":").map(Number);
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    bookingDate.setHours(hours, minutes, 0, 0);

    const dayOfWeek = bookingDate.getUTCDay();
    const availableTimes = await getAvailableTimesByDayOfWeek(date, dayOfWeek);
    console.log("الأوقات المتاحة لهذا اليوم:", availableTimes);

    if (!availableTimes.includes(time)) {
        return next(new ApiError("الوقت المطلوب غير متاح للحجز. يرجى اختيار وقت آخر.", 400));
    }

    // البحث عن الحجز السابق بناءً على رقم الهاتف
    let existingBooking = await Booking.findOne({ phoneNumber, isCancelled: false });
    if (existingBooking) {
        // تحويل تاريخ ووقت الحجز القديم إلى كائن Date
        const existingBookingDate = new Date(existingBooking.date);
        const [existingTimePart, existingPeriod] = existingBooking.time.split(" ");
        let [existingHours, existingMinutes] = existingTimePart.split(":").map(Number);
        if (existingPeriod === "PM" && existingHours < 12) existingHours += 12;
        if (existingPeriod === "AM" && existingHours === 12) existingHours = 0;
        existingBookingDate.setHours(existingHours, existingMinutes, 0, 0);

        // التحقق مما إذا كان الحجز الجديد أصغر من الحجز القديم
        if (bookingDate < existingBookingDate) {
            return next(new ApiError("لا يمكنك حجز موعد جديد ولديك حجز قديم ساري", 400));
        }
    }
    

    const visitorId = existingBooking ? existingBooking.visitorId : uuidv4();

    const booking = await Booking.create({
        visitorId,
        userName,
        phoneNumber,
        date,
        time,
        type,
        notes
    });

    // تحقق مما إذا كان الحجز تم إضافته إلى قاعدة البيانات
    const updatedBookedTimes = await Booking.find({ date, isCancelled: false }).select('time').lean();
    console.log("Updated Booked Times from DB after creation:", updatedBookedTimes);

    res.status(201).json({ data: booking });
});








  exports.addHoliday = asyncHandler(async (req, res, next) => {
    const { date, description } = req.body;

    // التحقق من أن التاريخ المضاف يساوي أو بعد التاريخ الحالي
    const today = new Date();
    today.setHours(0, 0, 0, 0); // تعيين الوقت إلى منتصف الليل للتأكد من مقارنة التاريخ فقط بدون الوقت
    const holidayDate = new Date(date);

    if (holidayDate < today) {
        return next(new ApiError("يجب أن يكون تاريخ العطلة أكبر من أو يساوي التاريخ الحالي", 400));
    }

    // التحقق من أن التاريخ المضاف ليس عطلة ثابتة
    const dayOfWeek = holidayDate.getDay(); // 0=الأحد, 1=الاثنين, ..., 5=الجمعة, 6=السبت
    const fixedHolidays = [5]; // تعريف العطلات الثابتة (مثل يوم الجمعة)

    if (fixedHolidays.includes(dayOfWeek)) {
        return next(new ApiError("لا يمكن إضافة عطلة في أيام العطلات الثابتة", 400));
    }

    // التحقق من أن العطلة ليست موجودة بالفعل في قاعدة البيانات
    const existingHoliday = await holidayModel.findOne({ date: holidayDate });
    if (existingHoliday) {
        return next(new ApiError("العطلة مضافة بالفعل", 400));
    }

    // التحقق من وجود حجوزات في هذا اليوم
    const existingBookings = await Booking.find({ date: holidayDate });
    if (existingBookings.length > 0) {
        return next(new ApiError("لا يمكن إضافة عطلة في يوم يوجد به مواعيد حجز، برجاء إلغاء المواعيد أولًا", 400));
    }

    // إذا تم التحقق من جميع الشروط، أضف العطلة الجديدة
    const holiday = await holidayModel.create({ date, description });
    res.status(201).json({ data: holiday });
});





    // تعديل عطلة
    exports.updateHoliday = asyncHandler(async (req, res, next) => {
        const { id } = req.params; // الحصول على معرف العطلة من المعاملات
        const { date, description } = req.body; // الحصول على البيانات من الجسم

        // التحقق مما إذا كانت العطلة موجودة
        const holiday = await holidayModel.findById(id);
        if (!holiday) {
            return next(new ApiError(`No holiday found for this id: ${id}`, 404));
        }

        // إذا تم تمرير تاريخ جديد، تحقق من أنه ليس عطلة ثابتة
        if (date) {
            const dayOfWeek = new Date(date).getDay();
            const fixedHolidays = [5]; // تعريف العطلات الثابتة (مثل يوم الجمعة)

            if (fixedHolidays.includes(dayOfWeek)) {
                return next(new ApiError("لا يمكن تعديل عطلة إلى يوم عطلة ثابتة", 400));
            }

            // تحقق من أن العطلة ليست موجودة بالفعل في قاعدة البيانات
            const existingHoliday = await holidayModel.findOne({ date: new Date(date) });
            if (existingHoliday && existingHoliday._id.toString() !== id) {
                return next(new ApiError("العطلة مضافة بالفعل في هذا التاريخ", 400));
            }

            // تحديث تاريخ العطلة
            holiday.date = new Date(date);
        }

        // تحديث الوصف إذا تم تمريره
        if (description) {
            holiday.description = description;
        }

        // حفظ التعديلات
        await holiday.save();

        res.status(200).json({ data: holiday });
    });





    // الحصول على جميع العطلات
    exports.getAllHolidays = asyncHandler(async (req, res) => {
        const holidays = await holidayModel.find(); // افترض أن لديك نموذج عطلات

        // تحويل التواريخ إلى أسماء الأيام
        const holidaysWithDayNames = holidays.map(holiday => {
            const date = new Date(holiday.date); // تحويل التاريخ إلى كائن Date
            const dayName = date.toLocaleString('ar-EG', { weekday: 'long' }); // الحصول على اسم اليوم باللغة العربية
            return {
                ...holiday.toObject(), // تحويل الكائن Mongoose إلى كائن عادي
                dayName // إضافة اسم اليوم
            };
        });

        res.status(200).json({ results: holidaysWithDayNames.length, data: holidaysWithDayNames });
    });



    // حذف عطلة
    exports.deleteHoliday = asyncHandler(async (req, res, next) => {
        const { id } = req.params; // الحصول على معرف العطلة من المعاملات

        // تحقق مما إذا كانت العطلة موجودة
        const holiday = await holidayModel.findByIdAndDelete(id);
        if (!holiday) {
            return next(new ApiError(`No holiday found for this id: ${id}`, 404));
        }

        // إذا تم الحذف بنجاح، أرسل استجابة مناسبة
        res.status(204).send(); // 204 No Content يعني أن العملية تمت بنجاح ولا توجد بيانات للإرجاع
    });



    // الحصول على الأيام المتاحة للحجز مع الأوقات المتاحة
exports.getAvailableDaysWithTimes = async (req, res, next) => {
    try {
        console.log("Start: getAvailableDaysWithTimes");

        const bookingSettings = await settingsModel.findOne().lean();
        const bookingScope = bookingSettings ? bookingSettings.bookingScope : 3;
        const forbiddenDays = new Set(bookingSettings ? bookingSettings.forbiddenDays : ["الجمعة"]);

        const availableDays = [];
        const today = new Date();
        const currentDate = today.toISOString().split("T")[0];
        const currentTimeInMinutes = today.getHours() * 60 + today.getMinutes();

        const datesToCheck = Array.from({ length: bookingScope }, (_, i) => {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            return date;
        });

        console.log("Dates to check:", datesToCheck);

        const [holidays, workingHours, bookedTimes] = await Promise.all([
            holidayModel.find({ date: { $in: datesToCheck } }).lean(),
            WorkingHoursModel.find({}).lean(),
            Booking.find({
                date: {
                    $gte: new Date(today.toISOString().split('T')[0]), 
                    $lte: new Date(datesToCheck[datesToCheck.length - 1].toISOString().split('T')[0])
                },
                isCancelled: false
            }).select('date time').lean()
        ]);

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

        const daysPromises = datesToCheck.map(async (currentDateObj) => {
            const dayOfWeek = currentDateObj.getDay();
            const dateString = currentDateObj.toISOString().split('T')[0];
            const dayName = currentDateObj.toLocaleString('ar-EG', { weekday: 'long' });

            if (!forbiddenDays.has(dayName) && !holidayDates.has(dateString)) {
                const workingHoursForDay = workingHoursMap[dayOfWeek] || [];
                const bookedTimesForDay = bookedTimesMap[dateString] || new Set();

                const availableTimes = workingHoursForDay.filter(time => {
                    const [timePart, period] = time.split(" ");
                    let [hours, minutes] = timePart.split(":").map(Number);
                    if (period === "PM" && hours < 12) hours += 12;
                    if (period === "AM" && hours === 12) hours = 0;
                    const timeInMinutes = hours * 60 + minutes;

                    console.log(`Checking time: ${time} on ${dateString}`);
                    console.log(`currentDate: ${currentDate}, dateString: ${dateString}`);
                    console.log(`timeInMinutes: ${timeInMinutes}, currentTimeInMinutes: ${currentTimeInMinutes}`);

                    // شرط تصفية الأوقات 
                    return (dateString > currentDate || (dateString === currentDate && timeInMinutes > currentTimeInMinutes))
                        && !bookedTimesForDay.has(time);
                });

                console.log(`Available times for ${dayName} (${dateString}):`, availableTimes);

                return {
                    date: dateString,
                    dayName,
                    availableTimes
                };
            } 
            return null;
        });

        const results = await Promise.all(daysPromises);
        const filteredResults = results.filter(day => day !== null);

        console.log("Final available days and times:", filteredResults);

        res.status(200).json({
            results: filteredResults.length,
            data: filteredResults
        });

    } catch (error) {
        console.error("Error in getAvailableDaysWithTimes:", error);
        if (!res.headersSent) {
            next(error);
        }
    }
};

    
    
    


    


    // تعديل دالة getAvailableTimes لتستقبل ساعات العمل كمعامل
    async function getAvailableTimesByDayOfWeek(date, dayOfWeek) {
        console.log(`Getting available times for date: ${date} (dayOfWeek: ${dayOfWeek})`);
    
        const workingHours = await WorkingHoursModel.findOne({ dayOfWeek });
        console.log("Working hours retrieved from DB:", workingHours.hours);
    
        const bookedTimes = await Booking.find({ date, isCancelled: false }).select('time'); // تأكد من استبعاد الحجوزات الملغاة
        const bookedTimesArray = bookedTimes.map(b => b.time);
        console.log("Booked times for this date:", bookedTimesArray);
    
        const availableTimes = workingHours.hours.filter(time => !bookedTimesArray.includes(time));
        console.log("Calculated available times:", availableTimes);
    
        return availableTimes;
    }




// إلغاء حجز غير ملغى باستخدام رقم الهاتف
// إلغاء حجز غير ملغى باستخدام رقم الهاتف
exports.cancelBooking = asyncHandler(async (req, res, next) => {
    const { phoneNumber } = req.params;
    const booking = await Booking.findOne({ phoneNumber, isCancelled: false });

    if (!booking) {
        return next(new ApiError(`لا يوجد حجز نشط لهذا الرقم: ${phoneNumber}`, 404));
    }

    booking.isCancelled = true;
    await booking.save();

    // تحديث الأوقات المتاحة بعد الإلغاء
    const availableTimes = await getAvailableTimesByDayOfWeek(booking.date, booking.date.getUTCDay());
    console.log("Available times after cancellation:", availableTimes);

    res.status(200).json({
        message: "تم إلغاء الحجز بنجاح",
        data: booking,
        availableTimesAfterCancellation: availableTimes
    });
});








    // الحصول على جميع الحجوزات الحالية فقط
    exports.getAllBookings = asyncHandler(async (req, res) => {
        const currentTime = new Date(); // الوقت والتاريخ الحالي
        
        // استخراج التاريخ الحالي بالتنسيق (YYYY-MM-DD)
        const currentDate = currentTime.toISOString().split("T")[0];
        const currentTimeInMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
        
        console.log("===== Debugging getAllBookings =====");
        console.log("Current Date:", currentDate);
        console.log("Current Time in Minutes:", currentTimeInMinutes);
        
        try {
            // جلب الحجوزات غير الملغاة
            let allBookings = await Booking.find({ isCancelled: false });
            console.log("Step 1 - All Non-cancelled Bookings:", allBookings);
    
            if (allBookings.length === 0) {
                console.log("No non-cancelled bookings found.");
                return res.status(200).json({ results: 0, data: [] });
            }
    
            // حساب `timeInMinutes` لكل حجز في اليوم الحالي إذا لم يكن موجودًا
            const currentDayBookings = allBookings.map(booking => {
                const [time, period] = booking.time.split(" ");
                let [hours, minutes] = time.split(":").map(Number);
                if (period === "PM" && hours < 12) hours += 12;
                if (period === "AM" && hours === 12) hours = 0;
                return {
                    ...booking.toObject(),
                    timeInMinutes: booking.timeInMinutes || hours * 60 + minutes,
                    formattedDate: booking.date.toISOString().split("T")[0] // تحويل تاريخ الحجز إلى نفس تنسيق currentDate
                };
            });
            console.log("Updated Bookings with Calculated timeInMinutes:", currentDayBookings);
    
            // فلترة الحجوزات المستقبلية والحجوزات في اليوم الحالي بعد الوقت الحالي
            let filteredBookings = currentDayBookings.filter(booking => {
                return (
                    booking.formattedDate > currentDate || 
                    (booking.formattedDate === currentDate && booking.timeInMinutes > currentTimeInMinutes)
                );
            });
            console.log("Step 3 - Final Filtered Bookings:", filteredBookings);
    
            // إرسال النتيجة النهائية
            res.status(200).json({ results: filteredBookings.length, data: filteredBookings });
        } catch (error) {
            console.error("Error in getAllBookings:", error);
            res.status(500).json({ status: "error", error });
        }
    });





  // الحصول على الحجوزات للمستخدم أو الزائر
exports.getUserOrVisitorBookings = asyncHandler(async (req, res) => {
    const { userId, visitorId, phoneNumber } = req.params; // استخراج المعرفات من الرابط

    let bookings;

    if (userId) {
        // إذا كان لدينا userId صالح، نبحث باستخدامه
        bookings = await Booking.find({ userId: userId, isCancelled: false });
    } else if (visitorId) {
        // إذا لم يكن لدينا userId صالح، نبحث باستخدام visitorId
        bookings = await Booking.find({ visitorId: visitorId, isCancelled: false });
    } else if (phoneNumber) {
        // إذا لم يكن لدينا userId أو visitorId، نبحث باستخدام رقم الهاتف
        bookings = await Booking.find({ phoneNumber: phoneNumber, isCancelled: false });
    } else {
        // إذا لم يكن أي من المعرفات موجودًا، نرجع خطأ
        return res.status(400).json({ message: 'يجب توفير userId أو visitorId أو phoneNumber' });
    }

    // تحقق من وجود حجوزات
    if (!bookings || bookings.length === 0) {
        return res.status(404).json({ message: "لا يوجد حجوزات لهذا الزائر." });
    }

    // إعادة الحجوزات للعميل
    res.status(200).json({
        results: bookings.length,
        data: bookings
    });
});




    // الحصول على جميع الحجوزات الملغية
    exports.getCancelledAppointment = asyncHandler(async (req, res) => {
        const bookings = await Booking.find({isCancelled:true});
        res.status(200).json({ results: bookings.length, data: bookings });
    });
