  const mongoose = require("mongoose");

  const bookingSchema = new mongoose.Schema({
    visitorId: {
      type: String,
      minlength: [5, "Visitor ID must be at least 5 characters"], // الحد الأدنى
      maxlength: [200, "Visitor ID must not exceed 200 characters"], // الحد الأقصى
      index: true,
      },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
        ref: "User" ,
         index: true
        
      },
    userName: { 
      type: String,
      required: [true, "Name is required"],
      minlength: [2, "Name must be at least 2 characters"], // الحد الأدنى
      maxlength: [40, "Name must not exceed 40 characters"], // الحد الأقصى
      },
    phoneNumber: {
      type: String,
        required: [true, "Phone number is required"],
        minlength: [11, "Phone number must be exactly 11 digits"], // الحد الأدنى
        maxlength: [11, "Phone number must be exactly 11 digits"], // الحد الأقصى
        match: [/^[\d\u0660-\u0669]+$/, "Phone number must contain only digits"],

      },
    date: { 
      type: Date, 
      required: [true, "Date is required"] ,
       index: true
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
          maxlength: [90, "Notes must not exceed 90 characters"], // التحقق من الطول
          validate: {
            validator: function(value) {
              // تحقق من عدد الكلمات
              return !value || value.split(" ").length <= 15;
            },
            message: "Notes must not exceed 15 words"
          }
        },
        
    isCancelled: { type: Boolean, default: false, index: true },
    isExpired: { type: Boolean, default: false, index: true },
  }, { timestamps: true });

  module.exports = mongoose.model("Booking", bookingSchema);
