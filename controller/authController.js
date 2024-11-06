const asyncHandler = require("express-async-handler")
const crypto = require("crypto")
const jwt = require("jsonwebtoken")
const ApiError = require("../utils/apiError")
const bcrypt = require('bcrypt');
const sendEmail = require("../utils/sendEmail")
const userModel = require("../models/userModel")
const createToken = require("../utils/createToken")



// @desc     Signup
// @route    GET /api/v1/auth/signup
// @access   public
exports.signup = asyncHandler ( async (req, res, next)=>{
    //1- Create user
    const user = await userModel.create({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,

    })

    //2- Generate token

  const token = createToken(user._id)

    res.status(201).json({data: user, token})
})

// @desc     login
// @route    GET /api/v1/auth/login
// @access   public
exports.login = asyncHandler ( async (req, res, next)=>{
    // 1- check if pw & email in the body (validation)

    // 2- check if user exist & check if pw is correct
    const user = await userModel.findOne({ email: req.body.email})
    if(!user || !(await bcrypt.compare(req.body.password, user.password))){
        return next(new ApiError("Incorrect email or password", 401))
    }

    // 3- generate token
    const token = createToken(user._id)
    // 4- send response to client side
    res.status(200).json({data: user, token})
})

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