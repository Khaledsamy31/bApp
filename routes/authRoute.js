const express = require("express")
const {
singupValidator,
loginValidator
    } = require("../utils/validator/authValidator")


const {
 signup,
 login,
 forgetPassword,
 verifyPasswordReset,
 resetPassword
} = require("../controller/authController")


const router = express.Router()




// get all users || create new user
router.post("/signup", singupValidator, signup)

router.post("/login", loginValidator, login)

router.post("/forgotpassword", forgetPassword)
router.post("/verifyresetcode", verifyPasswordReset)
router.put("/resetpassword", resetPassword)

// Get specific user by id
// router.route("/:id")
// .get(getUserValidator, getUser)
// .put(uploadUserImage, resizeImage , updateUserValidator, updateUser)
// .delete(deleteUserValidator, deleteUser)

module.exports = router