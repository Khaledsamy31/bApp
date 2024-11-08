const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        unique: true
    },
    description: {
        type: String,
        default: "Holiday"
    }
},{timestamps:true});

module.exports = mongoose.model("Holiday", holidaySchema);
