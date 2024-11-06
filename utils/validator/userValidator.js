// this to check the rules on route before send it to controller || db
const { check,body } = require('express-validator');
//check to check error in body or param or query...
const validatorMiddleware = require("../../middlewares/validatorMiddleware");
const { default: slugify } = require('slugify');
const userModel = require('../../models/userModel');
const bcrypt = require('bcrypt');



exports.createUserValidator = [
    check("name")
    .notEmpty().withMessage("user is required")
    .isLength({min:3}).withMessage("Too short user name")
    .isLength({max:30}).withMessage("Too long user name")
    .custom((val, {req})=>{
        req.body.slug = slugify(val)
        return true;
    }),
    check("email")
    .notEmpty().withMessage("email required")
    .isEmail().withMessage("Invalid email address")
    .custom((val)=> userModel.findOne({email: val}).then((user)=>{
        
            if(user){
                return Promise.reject( new Error("Email already exists"))
            }
            return true;
        }
    )),

    check("password")
    .notEmpty().withMessage("password required")
    .isLength({min:6}).withMessage("Password must be at least 6 characters long")
    .custom((password, {req})=>{
        if(password !== req.body.confirmPassword){
            throw new Error("Password Confirmation incorrect")
        }
        return true;
    }),

    check("confirmPassword")
    .notEmpty().withMessage("confirm password required"),

    check("profileImg")
    .optional(),

    check("role")
    .optional(),

    check("phone")
    .isMobilePhone(["ar-EG", "ar-SA"])
    .withMessage("Invalid phone number, only accept EGY & SA numbers")
    .optional()
    ,
    validatorMiddleware
];

exports.getUserValidator = [
        // 1- rules we check and send errors to validatorMiddleware
        check("id").isMongoId().withMessage("Invalid User id format"), validatorMiddleware,
];

exports.updateUserValidator =[
    check('id')
    .isMongoId().withMessage('Invalid ID formate'),
    check("name")
    .optional()
    .isLength({min:3}).withMessage("Too short user name")
    .isLength({max:30}).withMessage("Too long user name")
    .custom((val, {req})=>{
        req.body.slug = slugify(val)
        return true;
    }),
    check("email")
    .optional()
    .isEmail().withMessage("Invalid email address")
    .custom((val)=> userModel.findOne({email: val}).then((user)=>{
        
            if(user){
                return Promise.reject( new Error("Email already exists"))
            }
            return true;
        }
    )),


    check("profileImg")
    .optional(),

    check("role")
    .optional(),

    check("phone")
    .isMobilePhone(["ar-EG", "ar-SA"])
    .withMessage("Invalid phone number, only accept EGY & SA numbers")
    .optional()
    ,
    validatorMiddleware,

]

exports.changeUserPasswordValidator = [

    check("id")
    .isMongoId().withMessage("Invalid User id format"),


    body("currentPassword")
    .notEmpty().withMessage("Current password required"),
    
    body("confirmPassword")
    .notEmpty().withMessage("confirmPassword required"),

    body("password")
    .notEmpty().withMessage("password required")
    .custom(async(val,{req})=>{
        // 1- Verify current password
        const user = await userModel.findById(req.params.id)

        if(!user){
            throw new Error("There is no user for this id")
        }
        // to check if current pw = pw (true/false)
      const isCurrectPassword = await bcrypt.compare(req.body.currentPassword, user.password)

      if(!isCurrectPassword){
        throw new Error("Current password incorrect")
      }

        // 2- Verify confirmed password
      // val == password so it go like if(pw !== confirmPassword) throw new error
        if(val !== req.body.confirmPassword){
            throw new Error("Password Confirmation incorrect")
        }
        return true;
    })
    ,validatorMiddleware
]

exports.updateLoggedUserValidator =[
    check("name")
    .optional()
    .isLength({min:3}).withMessage("Too short user name")
    .isLength({max:30}).withMessage("Too long user name")
    .custom((val, {req})=>{
        req.body.slug = slugify(val)
        return true;
    }),
    check("email")
    .optional()
    .isEmail().withMessage("Invalid email address")
    .custom((val)=> userModel.findOne({email: val}).then((user)=>{
        
            if(user){
                return Promise.reject( new Error("Email already exists"))
            }
            return true;
        }
    )),

    check("phone")
    .isMobilePhone(["ar-EG", "ar-SA"])
    .withMessage("Invalid phone number, only accept EGY & SA numbers")
    .optional()
    ,
    validatorMiddleware,

]

exports.deleteUserValidator =[
    check("id").isMongoId().withMessage("Invalid User id format"), validatorMiddleware,

]