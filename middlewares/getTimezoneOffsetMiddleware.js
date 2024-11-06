const settingsModel = require("../models/settingsModel"); 
const asyncHandler = require("express-async-handler");

const getTimezoneOffset = asyncHandler(async (req, res, next) => {
    console.log("Retrieving timezone offset...");
    const settings = await settingsModel.findOne().lean();

    if (settings) {
        console.log("Timezone offset found:", settings.timezoneOffset);
        req.timezoneOffset = settings.timezoneOffset;
    } else {
        console.log("No timezone offset found, using default (2)");
        req.timezoneOffset = 2; // القيمة الافتراضية إذا لم يتم ضبطها
    }
    
    next();
});

module.exports = getTimezoneOffset;
