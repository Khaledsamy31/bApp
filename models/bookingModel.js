const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  visitorId: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  type: { type: String, enum: ["كشف", "استشارة"], required: true },
  notes: { type: String, default: "" },
  isCancelled: { type: Boolean, default: false },
  isExpired: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Booking", bookingSchema);
