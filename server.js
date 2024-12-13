const express = require("express")
const dotenv = require("dotenv")
const morgan = require("morgan")
const path = require("path")
const cors = require('cors')
const compression = require('compression')
const { rateLimit } = require('express-rate-limit') 
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const { xss } = require('express-xss-sanitizer');


// استدعاء ملف المهام المجدولة
require("./tasks/bookingExpiredFunction"); // <-- هذا السطر
require('./tasks/updateStats');
require('./controller/statisticsController');




//to get info from config.env
dotenv.config({path:"config.env"})

const ApiError = require("./utils/apiError")
const globalError = require("./middlewares/errorMiddleware")
const dbConnection = require("./config/database")

// routes

// "./routes" = "./routes/index"
const mountRoutes = require("./routes")


// to connect db
dbConnection();



//express app
const app = express();
app.use(cors())
app.options('*', cors())
app.use(compression())

app.use(express.static(path.join(__dirname, "uploads")))

//middleware before route
app.use(express.json({limit: "20kb"})) //to make parseing for data that comming from postman
if(process.env.NODE_ENV === "development"){

    app.use(morgan('dev'))
    console.log(`mode: ${process.env.NODE_ENV}`)
}

// to apply data Sanitization for more protect for nosql query injection
app.use(mongoSanitize());
// sanitizes user input data, to protect from scripting and more protect for inputs
app.use(xss());


// Limit each IP to 100 requests per `window` (here, per 15 minutes).
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 100, 
      message:
    "Too many accounts created from this IP, please try again after an hour"

	// store: ... , // Redis, Memcached, etc. See below.
})

// Apply the rate limiting middleware to all requests.
app.use("/api",limiter)

// Express middleware to protect against HTTP Parameter Pollution attacks
// to allow to use this paramters more than one time with same same name
app.use(hpp({ whitelist: [ 'date', "time" ] }));

// Mount Routes

mountRoutes(app) // get it from route/index file


app.all("*", (req, res, next)=>{

    next(new ApiError(`Can't fint this route: ${req.originalUrl}`, 400)) //ApiError(message, status)

})

// globale error handling middleware for express
app.use(globalError)


//to get port from config.env
const PORT= process.env.PORT || 8000;
const server = app.listen(PORT,()=>{
    console.log(`App running on port ${PORT}`)
})


// to handle rejection errors (errors that not from express || outside express)
process.on('unhandledRejection', (err) => {
    console.error(`UnhandledRejection ${err.name} | ${err.message}`)
    //to close app if there is an error not from express
    server.close(()=>{
        console.error(`Shutting down...`)
        process.exit(1)
    })
  });