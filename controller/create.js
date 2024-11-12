exports.createBooking = asyncHandler(async (req, res, next) => {
    const { userName, phoneNumber, date, time, type, notes } = req.body;
    const timezoneOffset = req.timezoneOffset;
    console.log(`Booking request received:`, { userName, phoneNumber, date, time, type, notes });

    const bookingDate = new Date(date);
    const [timePart, period] = time.split(" ");
    let [hours, minutes] = timePart.split(":").map(Number);
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    bookingDate.setUTCHours(hours + timezoneOffset, minutes, 0, 0);
    console.log(`Calculated booking date and time in UTC:`, bookingDate);

    // تحقق من أن تاريخ ووقت الحجز أكبر من الوقت الحالي
    const currentTime = new Date();
    currentTime.setUTCHours(currentTime.getUTCHours() + timezoneOffset);
    if (bookingDate < currentTime) {
        return next(new ApiError("لا يمكن حجز موعد في الماضي. يرجى اختيار موعد مستقبلي.", 400));
    }

    // التحقق من الأوقات المتاحة
    const dayOfWeek = bookingDate.getUTCDay();
    const availableTimes = await getAvailableTimesByDayOfWeek(date, dayOfWeek, timezoneOffset);
    console.error(`The requested time ${time} is not available for booking.`);

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
    console.log(`Booking created successfully:`, booking);

    res.status(201).json({ data: booking });
});