const cron = require("node-cron");
const Booking = require("../models/bookingModel");

async function updateExpiredBookings() {
    console.log("Checking for expired bookings...");

    const currentTimeUTC = new Date();
    const currentDateUTC = currentTimeUTC.toISOString().split("T")[0];
    const currentHours = currentTimeUTC.getUTCHours();
    const currentMinutes = currentTimeUTC.getUTCMinutes();
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;

    try {
        const result = await Booking.updateMany(
            {
                isExpired: false,
                $or: [
                    { date: { $lt: currentDateUTC } },
                    {
                        date: currentDateUTC,
                        $expr: {
                            $lt: [
                                {
                                    $add: [
                                        { 
                                            $multiply: [
                                                { 
                                                    $convert: { 
                                                        input: { $arrayElemAt: [{ $split: ["$time", ":"] }, 0] }, 
                                                        to: "int", 
                                                        onError: 0 
                                                    } 
                                                }, 
                                                60 
                                            ] 
                                        },
                                        { 
                                            $convert: { 
                                                input: { $arrayElemAt: [{ $split: ["$time", ":"] }, 1] }, 
                                                to: "int", 
                                                onError: 0 
                                            } 
                                        }
                                    ]
                                },
                                currentTimeInMinutes
                            ]
                        }
                    }
                ]
            },
            { $set: { isExpired: true } }
        );

        console.log(`Expired bookings updated successfully: ${result.modifiedCount} bookings marked as expired.`);
    } catch (error) {
        console.error("Error updating expired bookings:", error);
    }
}

// جدولة الوظيفة لتعمل كل نصف ساعة
cron.schedule("0,30 * * * *", updateExpiredBookings);

module.exports = { updateExpiredBookings };



// const cron = require("node-cron");
// const Booking = require("../models/bookingModel");

// async function updateExpiredBookings() {
//     console.log("Checking for expired bookings...");

//     const currentTimeUTC = new Date();
//     const currentDateUTC = currentTimeUTC.toISOString().split("T")[0];
//     const currentTimeInMinutes = currentTimeUTC.getUTCHours() * 60 + currentTimeUTC.getUTCMinutes();

//     try {
//         const bookings = await Booking.find({ isExpired: false});

//         for (const booking of bookings) {
//             const [time, period] = booking.time.split(" ");
//             let [hours, minutes] = time.split(":").map(Number);
//             if (period === "PM" && hours < 12) hours += 12;
//             if (period === "AM" && hours === 12) hours = 0;

//             const bookingTimeInMinutes = hours * 60 + minutes;
//             const bookingDate = new Date(booking.date).toISOString().split("T")[0];

//             if (
//                 bookingDate < currentDateUTC ||
//                 (bookingDate === currentDateUTC && bookingTimeInMinutes < currentTimeInMinutes)
//             ) {
//                 booking.isExpired = true;
//                 await booking.save();
//                 console.log(`Booking ${booking._id} marked as expired.`);
//             }
//         }

//         console.log("Expired bookings updated successfully.");
//     } catch (error) {
//         console.error("Error updating expired bookings:", error);
//     }
// }

// // جدولة الوظيفة لتعمل كل دقيقة
// cron.schedule("* * * * *", updateExpiredBookings);

// module.exports = { updateExpiredBookings };
