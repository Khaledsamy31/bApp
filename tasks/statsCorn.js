const cron = require('node-cron');
const Statistics = require('../models/monthlyBookingsStatsModel');

// مهمة لتحديث الإحصائيات في بداية كل شهر
cron.schedule('0 0 1 * *', async () => {
  try {
    console.log("Starting monthly statistics reset...");
    
    // يتم إنشاء إحصائيات جديدة للعملاء الجدد أو الزوار في بداية كل شهر
    // هنا يمكنك إضافة منطق لحفظ الإحصائيات للعملاء الذين لديهم حجوزات في الشهر الجديد.

    // هذا هو المكان الذي يمكن فيه عمل عمليات أخرى مثل إعادة تعيين أو حفظ إحصائيات جديدة
  } catch (error) {
    console.error("Error resetting statistics:", error);
  }
});


// عند بدء تشغيل السيرفر
const initializeStatistics = async () => {
  try {
    console.log("Initializing monthly statistics...");
    // يمكنك هنا إجراء أي إجراءات أولية أو عمليات معينة مثل تنظيف الإحصائيات القديمة إذا لزم الأمر.
  } catch (error) {
    console.error("Error initializing statistics:", error);
  }
};

initializeStatistics();
