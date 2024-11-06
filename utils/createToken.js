const jwt = require("jsonwebtoken")

const createToken = (payload)=>{

    // we send 3 things: 1- data we want to return like user id cuz it unqiue, secret key, expire time 30d, 30m...
  
      //payload we send in it user id cuz id is unique
      return jwt.sign({userId: payload}, process.env.JWT_SECRET_KEY,{
          expiresIn: process.env.JWT_EXPIRE_TIME
      })
  }

  module.exports = createToken