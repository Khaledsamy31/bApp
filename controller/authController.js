const asyncHandler = require("express-async-handler")
const crypto = require("crypto")
const jwt = require("jsonwebtoken")
const ApiError = require("../utils/apiError")
const bcrypt = require('bcrypt');
const sendEmail = require("../utils/sendEmail")
const userModel = require("../models/userModel")
const createToken = require("../utils/createToken")
const Booking = require("../models/bookingModel"); 



// @desc     Signup
// @route    GET /api/v1/auth/signup
// @access   public
exports.signup = asyncHandler(async (req, res, next) => {
    // 1- إنشاء مستخدم جديد
    const user = await userModel.create({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
    });

    // 2- إزالة كلمة المرور من الاستجابة
    user.password = undefined;

    // 3- إنشاء توكن JWT
    const token = createToken(user._id);

    // 4- إرسال الاستجابة
    res.status(201).json({
        status: "success",
        data: {
            user, // معلومات المستخدم (بدون كلمة المرور)
        },
        token, // التوكن الخاص بالمستخدم
    });
});


// @desc     login
// @route    GET /api/v1/auth/login
// @access   public
exports.login = asyncHandler(async (req, res, next) => {
    const { email, password, visitorId } = req.body;
  
    // 1- التحقق من وجود المستخدم بالبريد الإلكتروني وكلمة المرور
    const user = await userModel.findOne({ email }).select('+password');;
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(new ApiError("Incorrect email or password", 401));
    }
  
    // 2- التحقق من وجود `visitorId` وإلحاق الحجوزات بحساب المستخدم
    let linkedBookingsCount = 0;
    if (visitorId) {
      const updatedBookings = await Booking.updateMany(
        { visitorId, userId: null }, // الحجوزات التي تخص الزائر فقط
        { userId: user._id } // ربطها بحساب المستخدم
      );
  
      // التحقق من عدد الحجوزات التي تم تعديلها
      linkedBookingsCount = updatedBookings.modifiedCount || 0;
      console.log(`Linked ${linkedBookingsCount} bookings to user ${user._id}`);
    }
  
// 3- جلب جميع الحجوزات المتعلقة بالمستخدم والتي لم يتم إلغاؤها أو انتهاؤها
const bookings = await Booking.find({
    userId: user._id, // الحجوزات الخاصة بالمستخدم
    isCancelled: false, // غير ملغية
    isExpired: false,   // غير منتهية
});



    // 4- إنشاء التوكن JWT
    const token = createToken(user._id);
  
    // 5- إرسال الرد
    res.status(200).json({
      status: "success",
      message: `Login successful. ${linkedBookingsCount} bookings have been linked to your account.`,
      user,
      token,
    });
  });
  





// @desc     to allow to visitor and user to create booking
exports.optionalProtect = asyncHandler(async (req, res, next) => {
    let token;

    // 1- استخراج التوكن إذا كان موجودًا
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    // 2- إذا لم يكن التوكن موجودًا، السماح بالمرور كزائر
    if (!token) {
        return next(); // السماح للطلب بالمرور بدون تعيين req.user
    }

    try {
        // 3- التحقق من صحة التوكن
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

        // 4- التحقق من وجود المستخدم
        const currentUser = await userModel.findById(decoded.userId);

        if (!currentUser) {
            console.log("User not found, continuing as guest.");
            return next();
        }

        // 5- التحقق مما إذا كان المستخدم قد غيّر كلمة المرور بعد إنشاء التوكن
        if (currentUser.passwordChangedAt) {
            const passChangedTimestamp = parseInt(
                currentUser.passwordChangedAt.getTime() / 1000,
                10
            );
            if (passChangedTimestamp > decoded.iat) {
                console.log("Password changed after token was issued, continuing as guest.");
                return next();
            }
        }

        // 6- إذا كان المستخدم نشطًا، تعيينه إلى `req.user`
        if (!currentUser.active && req.route.path !== '/activeMe') {
            console.log("User is not active, continuing as guest.");
            return next();
        }

        req.user = currentUser; // تعيين المستخدم
    } catch (err) {
        console.log("Invalid token, continuing as guest.");
    }

    next(); // السماح بالمرور في جميع الحالات
});

// @desc     to make sure the user is logged in
exports.protect = asyncHandler(async(req,res,next)=>{

    // 1- check if token exited, if true get it
    let token;
    if(req.headers.authorization && req.headers.authorization.startsWith("Bearer")){
        token = req.headers.authorization.split(" ")[1];
      
    }

    if(!token){
        return next(new ApiError("please login to get access this route", 401))
    }

    // 2- verify token (no change happens, expired token)
   const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY)

    // 3- check if user exists
    const currentUser = await userModel.findById(decoded.userId)

    if(!currentUser){
        return next(new ApiError("User that belong to this token does not longger exist", 401))
    }
    // 4- check if user change his password after create token

    if(currentUser.passwordChangedAt){
        // getTime convert data to timeStamp or mili secound
        const passChangedTimestamp = parseInt(
            currentUser.passwordChangedAt.getTime() / 1000, 10 // to covert mili secound to secound
        ) 
        console.log(passChangedTimestamp , decoded.iat)
        // if password changed after create token
        if(passChangedTimestamp > decoded.iat){
            return next(new ApiError("User recently changed his password. Please login again", 401))
        }
    }
    // check if user is active
    // السماح للمستخدم غير النشط فقط بتنفيذ دالة تفعيل الحساب
    if (!currentUser.active && req.route.path !== '/activeMe') {
        return next(new ApiError('User account is not active', 403));
    }
    // if everything is ok, save user in req.user
    req.user = currentUser
    next()
})

// @desc     Authorization (user permissions)
// ...roles to get more than one role like this ["admin", "manager"]
exports.allowedTo = (...roles)=> asyncHandler(async(req,res,next)=>{

    // 1- access roles
    if(!roles.includes(req.user.role)){
        return next(new ApiError("You are not authorized to access this route", 403))
    }
    next()
    // 2- access registered user by (req.user.role) to get current user
})


// @desc     Forgot password
// @route    POST /api/v1/forgotpassword
// @access   public
exports.forgetPassword = asyncHandler(async(req, res, next)=>{

    // 1- get user by email
    const user = await userModel.findOne({email: req.body.email})
    if(!user){
        return next(new ApiError(`User with this email ${req.body.email} does not exist`, 404))
    }
    // 2- if user exist, generate random 6 digits/numbers and save it db
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString()
    // to hash reset cpde
    const hashResetCode = crypto
    .createHash("sha256")
    .update(resetCode)
    .digest("hex")

    // save hashed password reset code in db
    user.passwordResetCode = hashResetCode
    // add expiration time for reset code after 10mins
    user.passwordResetExpiresAt = Date.now() + 10 * 60 * 1000;
    // to change status from false to true after user do verify to his reset password code
    user.passwordResetVerified = false

   await user.save()

    // 3- send reset code to the user email
    const emailMessage = `hello ${user.name},\n we recived a request to reset the password on your E-shop Account> \n ${resetCode} \n enter this code to complete the reset \n Thanks for helping us to keep you account secure \n The e-shop team`
    
    try{
        await sendEmail({
            to: user.email,
            subject: "your password reset code (valid for 10mins only)",
            text: emailMessage
        })
    }catch(e){
        user.passwordResetCode = undefined,
        user.passwordResetExpiresAt = undefined,
        user.passwordResetVerified = undefined,
        await user.save()

        return next(new ApiError("Failed to send email. Please try again later", 500))
    }

    res.status(200).json({status: "Success", message: "reset code sent to your email"})
})

// @desc     verify password
// @route    POST /api/v1/verifyresetcode
// @access   public
exports.verifyPasswordReset = asyncHandler(async(req,res,next)=>{

    // 1- get user based on reset code
    // this do hash to reset code
    const hashResetCode = crypto
    .createHash("sha256")
    .update(req.body.resetCode)
    .digest("hex")

    const user = await userModel.findOne({
        passwordResetCode: hashResetCode, 
        passwordResetExpiresAt: {$gt: Date.now()} // to find reset code that expire date of it > of the current time
    })

    if(!user){
        return next(new ApiError("Invalid or expired reset code", 400))
    }
    //2- reset code valid
    user.passwordResetVerified = true
    await user.save()

    res.status(200).json({status: "Success", message: "password reset verified"})
})

// @desc     reset password
// @route    POST /api/v1/resetpassword
// @access   public

exports.resetPassword = asyncHandler(async(req, res, next)=>{
    // 1- get user based on email
    const user = await userModel.findOne({email: req.body.email})
    if(!user){
        return next(new ApiError(`User with this email ${req.body.email} does not exist`, 404))
    }
    // check if reset code verified
    if(!user.passwordResetVerified){
        return next(new ApiError("Please verify your reset code first", 400))
    }

    user.password = req.body.newPassword
    user.passwordResetCode = undefined
    user.passwordResetExpiresAt = undefined
    user.passwordResetVerified = undefined
    await user.save()

    // 3- if everything is okie, generate token
    const token = createToken(user._id)
    res.status(200).json({token})
})