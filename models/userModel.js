const mongoose = require("mongoose")

const bcrypt = require('bcrypt');
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true,"Name is required"],
        minlength: [3,"Too short name"],
        maxlength: [50,"Too long name"],
        trim: true
    },
    email: {
        type: String,
        required: [true,"Email is required"],
        unique: [true, "Email must be unique"],
        lowercase: true
    },
    phone: String,
    profileImg: String,

    password: {
        type: String,
        required: [true,"Password is required"],
        minlength: [6,"Password should be at least 8 characters long"],
        select: false,

    },
    passwordChangedAt: Date,
    passwordResetCode: String,
    passwordResetExpiresAt: Date,
    passwordResetVerified: Boolean,
    role:{
        type: String,
        enum: ["user", "manager", "admin"],
        default: "user"
    },
    active:{
        type: Boolean,
        default: true
    },
    // child reference (1 to many relation) we use it if there is not many items
    wishlist: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Product"
    },
    addresses: [
      {
        id: { type: mongoose.Schema.Types.ObjectId },
        alias: { type: String, maxlength: [20, "Alias cannot exceed 20 characters"] },
        details: { type: String, maxlength: [150, "Details cannot exceed 150 characters"] },
        phone: String,
        city: { type: String, maxlength: [20, "City name cannot exceed 20 characters"] },
        postalCode: String
      }
    ],
    slug: {
        type: String,
        lowercase: true,
    },
  
},{timestamps: true})

userSchema.pre("save", async function(next){
  // Hashing user password
  if(!this.isModified("password")) return next() // if pw not changed don't do this middleware
  this.password = await bcrypt.hash(this.password, 12)
  next()

})


const setImageUrl = (doc)=>{
    // return image  baseUrl + image name
  // doc = document in db
  if(doc.profileImg){
    //BASE_URL in env file
    const imageUrl = `${process.env.BASE_URL}/users/${doc.profileImg}`
    doc.profileImg = imageUrl
  }

}

// this works on get all cat & get one cat & update cat
userSchema.post('init', (doc) => {
  setImageUrl(doc)

});
// this work on post/create cat
userSchema.post('save', (doc) => {
  setImageUrl(doc)

});


const  userModel = mongoose.model("User", userSchema)

module.exports = userModel;
