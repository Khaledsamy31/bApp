const multer = require("multer")
const ApiError = require("../utils/apiError")

const multerOptions = ()=>{
        // multer package (1- disk storage engine)
// const multerStorage = multer.diskStorage({
//     destination: function(req,file,cb){
//         cb(null,"uploads/categories")
//     },
//     filename: function(req,file,cb){
//         //category-${id}-Date.now().jpeg
//         const ext = file.mimetype.split("/")[1]
//         const filename = `category-${uuidv4()}-${Date.now()}.${ext}`
//         cb(null, filename)
//     }
// })

    // 2- Memory storage engine
const multerStorage = multer.memoryStorage()
// to check the uploaded file is image
const multerFilter = function(req, file, cb){
    if(file.mimetype.startsWith("image")){
        cb(null, true)
    }else{
        cb(new ApiError("Not an image! Please upload an image.", 400), false)
    }
}

const upload = multer({storage: multerStorage, fileFilter: multerFilter})
return upload;

}


// return one image
exports.uploadSingleImage = (fieldName)=> multerOptions().single(fieldName)

// return array of images
exports.uploadMixOfImages = (arrayOfFeilds)=> multerOptions().fields(arrayOfFeilds)
