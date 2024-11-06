const express = require("express")

const {
    getUserValidator,
     createUserValidator,
      updateUserValidator,
       deleteUserValidator,
       changeUserPasswordValidator,
       updateLoggedUserValidator
       
    } = require("../utils/validator/userValidator")


const {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    uploadUserImage,
    resizeImage,
    changeUserPassword,
    getLoggedUserData,
    updateLoggedUserPassword,
    updateLoggedUserData,
    deleteLoggedUserData,
    activeLoggedUserData
} = require("../controller/userController")

const authService = require("../controller/authController")

const router = express.Router()

router.get("/getMe",authService.protect, getLoggedUserData, getUser)
router.put("/changeMyPassword",authService.protect, updateLoggedUserPassword)
router.put("/updateMe",authService.protect,updateLoggedUserValidator, updateLoggedUserData)
router.delete("/deleteMe",authService.protect, deleteLoggedUserData)
router.delete("/activeMe",authService.protect, activeLoggedUserData)

router.put("/changePassword/:id",changeUserPasswordValidator, changeUserPassword)


// get all users || create new user
router.route("/")
.get(
    authService.protect,
    authService.allowedTo("admin"),
    getUsers
    )
.post(
    authService.protect,
    authService.allowedTo("admin"),
    uploadUserImage, 
    resizeImage, 
    createUserValidator, 
    createUser
    )

// Get specific user by id
router.route("/:id")
.get(
    authService.protect,
    authService.allowedTo("admin"),
    getUserValidator, 
    getUser
    )
.put(
    authService.protect,
    authService.allowedTo("admin"),
    uploadUserImage, 
    resizeImage, 
    updateUserValidator, 
    updateUser
    )
.delete(
    authService.protect,
    authService.allowedTo("admin"),
    deleteUserValidator, 
    deleteUser
    )

module.exports = router