// this is validate functions we do to handle catched errors
const { validationResult } = require('express-validator');

// middleware => catch errors from rules if it existed
const validatorMiddleware =  (req,res, next)=>{
// @desc  Finds the validation errors in this request and wraps them in an object with handy functions
const errors = validationResult(req);
if (!errors.isEmpty()) {
  return res.status(400).json({ errors: errors.array() });
}
    next()
}

module.exports = validatorMiddleware