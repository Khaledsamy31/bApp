const asyncHandler = require("express-async-handler")
const ApiError = require("../utils/apiError")
const userModel = require("../models/userModel")
const bcrypt = require('bcrypt');

const factory = require("./handlersFactory")
const { v4: uuidv4 } = require('uuid'); // to generate unique id
const sharp = require('sharp');
const {uploadSingleImage} = require("../middlewares/uploadImageMiddleware")
const createToken = require("../utils/createToken")


//upload single image
exports.uploadUserImage = uploadSingleImage("profileImg")

// shap package to do resize to images and do some image processing
//image processing
exports.resizeImage = asyncHandler( async(req,res,next) =>{

    const filename = `user-${uuidv4()}-${Date.now()}.jpeg`
    
    // check if there is an image to upload
    if(req.file){

        await sharp(req.file.buffer)
         .resize(600,600)
         .toFormat("jpeg")
         .jpeg({quality: 90}).toFile(`uploads/users/${filename}`);
     
         req.body.profileImg = filename; // to save image in db
    }
    next();
});

// @desc     Create user
// @route    POST  /api/v1/users
// @access   Private/admin

exports.createUser = factory.createOne(userModel)


// @desc     Get all users
// @route    GET  /api/v1/users
// @access   private/admin

exports.getUsers = factory.getAll(userModel)



// @ desc    Get specific user by id
// @route    GET   /api/v1/user/:id
// @access   Private/admin

exports.getUser = factory.getOne(userModel)



// @ desc    update specific user by id
// @route    GET   /api/v1/users/:id
// @access   Private/admin

exports.updateUser = asyncHandler(async(req,res, next)=>{
    
    const document = await userModel.findByIdAndUpdate(req.params.id,{
        // data can i update
        name: req.body.name,
        slug: req.body.slug,
        phone: req.body.phone,
        email: req.body.email,
        profileImg: req.body.email,
        role: req.body.role,
    },
        {new:true} // new = true, to show category in body after updated
    )
    
    if(!document){
        return next(new ApiError( `No document for this id ${req.params.id}`, 404))
    }
    res.status(201).json({data: document})
    
})

// update password
exports.changeUserPassword = asyncHandler(async(req,res, next)=>{
    
    const document = await userModel.findByIdAndUpdate(req.params.id,{
        // data can i update
        password: await bcrypt.hash(req.body.password, 12),
        passwordChangedAt: Date.now(),

    },
        {new:true} // new = true, to show category in body after updated
    )
    
    if(!document){
        return next(new ApiError( `No document for this id ${req.params.id}`, 404))
    }
    res.status(201).json({data: document})
    
})


// @ desc    Delete specific user by id
// @route    DELETE   /api/v1/users/:id
// @access   Private/admin

exports.deleteUser = factory.deleteOne(userModel)


// @desc     Get logged user data
// @route    GET  /api/v1/user/getMe
// @access   private/protect

exports.getLoggedUserData = asyncHandler(async(req,res, next)=>{

    req.params.id = req.user._id
    next()
    
})

// @desc     Update logged user password
// @route    GET  /api/v1/user/changeMyPassword
// @access   private/protect

exports.updateLoggedUserPassword = asyncHandler(async(req,res, next)=>{
    // 1- update user password based user play load (req.user._id)
    const user = await userModel.findByIdAndUpdate(req.user.id,{
        // data can i update
        password: await bcrypt.hash(req.body.password, 12),
        passwordChangedAt: Date.now(),

    },
        {new:true} // new = true, to show category in body after updated
    );
    // 2- Generate token
    const token = createToken(user._id)

    res.status(200).json({data: user, token})
})

// @desc     Update logged user data (without password, role)
// @route    PUT  /api/v1/user/updateMe
// @access   private/protect


exports.updateLoggedUserData = asyncHandler(async(req, res, next) => {
    const updatedUser = await userModel.findByIdAndUpdate(req.user._id, {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
    }, { new: true });

    if (!updatedUser) {
        return next(new ApiError('User not found', 404));
    }

    res.status(200).json({ data: updatedUser });
});
//=========================this service for deactive-active user ===================== we can add it to admin else
// @desc     Deactivate Logged user
// @route    DELETE  /api/v1/user/deleteMe
// @access   private/protect

exports.deleteLoggedUserData = asyncHandler(async (req, res, next) => {
    if (!req.user || !req.user._id) {
        return next(new ApiError('User not found', 404));
    }

    // Deactivate the user
    await userModel.findByIdAndUpdate(req.user._id, { active: false });

    res.status(204).json({ status: 'Success' });
});

// @desc     Active Logged user
// @route    UPDATE  /api/v1/user/activeMe
// @access   private/protect

exports.activeLoggedUserData = asyncHandler(async (req, res, next) => {
    if (!req.user || !req.user._id) {
        return next(new ApiError('User not found', 404));
    }

    // active the user
   const user = await userModel.findByIdAndUpdate(req.user._id, { active: true },{new:true});

    res.status(200).json({ status: 'Success', data: user });
});
