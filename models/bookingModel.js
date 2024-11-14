const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  visitorId: {
     type: String,
     minlength: [5, "Visitor ID must be at least 5 characters"], // الحد الأدنى
     maxlength: [100, "Visitor ID must not exceed 30 characters"], // الحد الأقصى
    
    },
  userId: {
     type: mongoose.Schema.Types.ObjectId,
      ref: "User" 
    },
  userName: { 
    type: String,
     required: [true, "Name is required"],
     minlength: [2, "Name must be at least 2 characters"], // الحد الأدنى
     maxlength: [30, "Name must not exceed 30 characters"], // الحد الأقصى
    },
  phoneNumber: {
     type: String,
      required: [true, "Phone number is required"],
      minlength: [11, "Phone number must be exactly 10 digits"], // الحد الأدنى
      maxlength: [11, "Phone number must be exactly 11 digits"], // الحد الأقصى
      match: [/^\d+$/, "Phone number must contain only digits"],
    },
  date: { 
    type: Date, 
    required: [true, "Date is required"] 
   },

  time: {
     type: String,
     required: [true, "Time is required"] 
    },
    type: {
      type: String, // نوع الحجز كـ String
      required: [true, "Type is required"],
      },

  notes: { 
    type: String,
     default: "",
     maxlength: [200, "Notes must not exceed 200 characters"], // الحد الأقصى
    },
  isCancelled: { type: Boolean, default: false },
  isExpired: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Booking", bookingSchema);
