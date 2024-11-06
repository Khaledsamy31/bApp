const mongoose = require("mongoose")

//connect with db

const dbConnection = ()=>{

    mongoose.connect(process.env.DB_URI)
    .then((conn)=>{
        console.log(`DataBase Connected: ${conn.connection.host}`)
    })
    // .catch((err)=>{
    //     console.error(`Database Error ${err}`)
    //     //to close app if there is an error
    //     process.exit(1)
    // })

}

module.exports = dbConnection