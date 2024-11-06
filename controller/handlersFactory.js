const asyncHandler = require("express-async-handler")
const ApiError = require("../utils/apiError")
const ApiFeatures = require("../utils/apiFeatures")

exports.deleteOne = (Model) => asyncHandler(async(req,res, next)=>{
    const {id} = req.params;
    const document = await Model.findByIdAndDelete(id)

    if(!document){
        return next(new ApiError( `No document for this id ${id}`, 404))
    }
    res.status(204).send()
    // Trigger "remove" event when do update for document to run method save in reviewModel when we update review
        document.remove()
})

exports.updateOne = (Model) => asyncHandler(async(req,res, next)=>{
  
    
    const document = await Model.findByIdAndUpdate(
        req.params.id,
        req.body,
        {new:true} // new = true, to show category in body after updated
    )
    
    if(!document){
        return next(new ApiError( `No document for this id ${req.params.id}`, 404))
    }
    res.status(201).json({data: document})
    // Trigger "save" event when do update for document to run method save in reviewModel when we update review
    document.save()
})

exports.createOne = (Model) => asyncHandler( async(req,res)=>{
    
    const newDoc = await  Model.create(req.body)
    //we didn't use try& catch cuz we use package asynchandler to catch errors
    res.status(201).json({data:newDoc});
    
})

exports.getOne = (Model,populationOpt) => asyncHandler( async(req,res,next)=>{

    const {id} = req.params;
    // 1- build query
    let query =  Model.findById(id);

    if(populationOpt){
     query = query.populate(populationOpt)
    }

    // 2- Execute query
    const document = await query;

    if(!document){
        // res.status(404).json({msg: `No document for this id ${id}`})
       return next(new ApiError( `No document for this id ${id}`, 404))
    }
        res.status(201).json({data: document})
    
})

exports.getAll = (Model, modelName ="") => asyncHandler(async(req,res)=>{
    // Nested route.. to get all subCat belong to a Cat
    let filter = {};
    if(req.filterObj) {filter = req.filterObj}

    // Build query
    const documentsCounts = await Model.countDocuments() //countDocuments() return number of doc in db
    const apiFeatures = new ApiFeatures(Model.find(filter), req.query)
    .filter()
    .search(modelName)
    .sort()
    .limitFields()
    .paginate(documentsCounts);

     //execute query
     const {mongooseQuery, paginationResult} = apiFeatures;
     const   documents = await mongooseQuery
          res.status(200).json({results: documents.length, paginationResult, data: documents})

})
