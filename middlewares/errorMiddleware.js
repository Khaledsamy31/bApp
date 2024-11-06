const ApiError = require("../utils/apiError")

// this method to change name of error when token is invalid
const handleJwtIvalidSignature = ()=> new ApiError("invalid token, please login again", 401)
const handleJwtExpired = ()=> new ApiError("expired token, please login again", 401)


const sendErrorForDevMode = (err, res)=>{
//this for development mode
    res.status(err.statusCode).json({
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack,
    })
}

const sendErrorForProductionMode = (err, res)=>{
//this for Production mode
    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
    })
}

const globalError = (err, req, res, next)=>{
    err.statusCode = err.statusCode || 500
    err.status = err.status || "error"
    if(process.env.NODE_ENV === "development"){
        sendErrorForDevMode(err,res);
    }else{
        //production mode

        // to change the error name when send invalide token
        if(err.name === "JsonWebTokenError") err = handleJwtIvalidSignature()
        // to change the error name when send expired token
        if(err.name === "TokenExpiredError") err = handleJwtExpired()
        sendErrorForProductionMode(err,res)
    }

}

module.exports = globalError