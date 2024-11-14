const mongoose = require('mongoose');

// تعريف نموذج ساعات العمل المتاحة لكل يوم
const workingHoursSchema = new mongoose.Schema({
    dayOfWeek: {
         type: Number,
         required: [true, "Day of the week is required"], // رسالة عند عدم وجود اليوم
         min: [0, "Day of the week must be between 0 (Sunday) and 6 (Saturday)"], // الحد الأدنى (0)
         max: [6, "Day of the week must be between 0 (Sunday) and 6 (Saturday)"], // الحد الأقصى (6) 
        
        }, // 0 = الأحد، 1 = الإثنين، ... 6 = السبت
        hours: { 
            type: [String], 
            required: [true, "Working hours are required"], // رسالة عند عدم وجود ساعات العمل
            validate: {
                validator: function(hours) {
                    // التحقق من أن كل وقت في صيغة صحيحة (مثال: "09:00 AM")
                    return hours.every(hour => /^([0-9]{2}):([0-9]{2}) (AM|PM)$/.test(hour));
                },
                message: "Each hour must follow the format 'HH:MM AM/PM'", // رسالة عند وجود خطأ في صيغة الوقت
            },
        },// الأوقات المتاحة لهذا اليوم، مثل ["09:00 AM", "10:00 AM", "05:00 PM"]

},{timestamps:true});

const WorkingHours = mongoose.model('WorkingHours', workingHoursSchema);

module.exports = WorkingHours;
