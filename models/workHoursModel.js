const mongoose = require('mongoose');

// تعريف نموذج ساعات العمل المتاحة لكل يوم
const workingHoursSchema = new mongoose.Schema({
    dayOfWeek: { type: Number, required: true }, // 0 = الأحد، 1 = الإثنين، ... 6 = السبت
    hours: { type: [String], required: true }, // الأوقات المتاحة لهذا اليوم، مثل ["09:00 AM", "10:00 AM", "05:00 PM"]

});

const WorkingHours = mongoose.model('WorkingHours', workingHoursSchema);

module.exports = WorkingHours;
