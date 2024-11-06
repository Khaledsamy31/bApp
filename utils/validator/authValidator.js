// this to check the rules on route before send it to controller || db
const { check,body } = require('express-validator');
//check to check error in body or param or query...
const validatorMiddleware = require("../../middlewares/validatorMiddleware");
const { default: slugify } = require('slugify');
const userModel = require('../../models/userModel');
const bcrypt = require('bcrypt');

// @desc   Signup
// @route  GET /api/v1/auth/signup
// @access  Public

exports.singupValidator = [
    check("name")
    .notEmpty().withMessage("user name is required")
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

    validatorMiddleware
];


// @desc   login
// @route  GET /api/v1/auth/login
// @access  Public

exports.loginValidator = [

    check("email")
    .notEmpty().withMessage("email required")
    .isEmail().withMessage("Invalid email address"),

    check("password")
    .notEmpty().withMessage("password required")
    .isLength({min:6}).withMessage("Password must be at least 6 characters long"),

    validatorMiddleware
];



