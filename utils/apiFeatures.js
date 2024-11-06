// const productModel = require("../models/productModel")
class ApiFeatures {
    constructor(mongooseQuery, queryString) {
        this.mongooseQuery = mongooseQuery;
        this.queryString = queryString;
    }
    
    filter() {
        const queryStringObj = {... this.queryString} // to take a copy of req.query and change in it only
        const excludesFields = ["keyword", "page","sort","limit","fields"]// things we want to remove from query
        
        excludesFields.forEach(field => delete queryStringObj[field]); // removing fields from query string
    
        // apply filtteration useing [gte, gt,  lte, lt]
        let queryStr = JSON.stringify(queryStringObj)
        queryStr = queryStr.replace(/\b(gte|gt|lt|lte)\b/g, match => `$${match}`) // to replace gte, gte, lte, lte with their corresponding mongoose operators  
    
        this.mongooseQuery = this.mongooseQuery.find(JSON.parse(queryStr)) // parse JSON string back to object
        return this;
    }

    sort() {
        if(this.queryString.sort){
            const sortBy = this.queryString.sort.split(",").join(' ')
         
           this.mongooseQuery = this.mongooseQuery.sort(sortBy)
        }else{
         this.mongooseQuery = this.mongooseQuery.sort("-createdAt") // to sort by createdAt in descending order
        }
        return this;
    }

    limitFields(){
        if(this.queryString.fields){
            const fields = this.queryString.fields.split(",").join(" ")
    
            this.mongooseQuery = this.mongooseQuery.select(fields)
        }else{
            this.mongooseQuery = this.mongooseQuery.select("-__v") // to exclude __v field from response
        }
        return this;
    }

    search(modelName){
        if(this.queryString.keyword){
            const keyword = this.queryString.keyword;
            if(modelName === "productModel"){

                this.mongooseQuery = this.mongooseQuery.or([
                    { title: { $regex: keyword, $options: "i" } },
                    { description: { $regex: keyword, $options: "i" } }
                ]);
            }else{
                this.mongooseQuery = this.mongooseQuery.or([
                    { name: { $regex: keyword, $options: "i" } },
                    { description: { $regex: keyword, $options: "i" } }
                ]);
            }
        }
        return this;
    }
    

    paginate (countDecuments){
        const page = this.queryString.page * 1 || 1; // to get page number from query string & convert it to number * 1
        const limit = this.queryString.limit * 1 || 25;
        const skip = (page - 1) * limit // (page 2 - 1) = 1 * 5(limit) to show 5 doc
        const endIndex = page *limit //ex: page 2 * 10 limit = 20 endIndex
        
        //Pagination resust
        const pagination = {};
        pagination.currentPage = page;
        pagination.limit = limit;
        pagination.numberOfpages = Math.ceil(countDecuments / limit) //ex: number of page 50 / limit 10 = 5 pages

        //next page
        if(endIndex < countDecuments){
            pagination.next = page + 1;
        }
        // pre page
        if(skip > 0){
            pagination.prev = page - 1;
        }

        this.mongooseQuery = this.mongooseQuery.skip(skip).limit(limit);
        this.paginationResult = pagination;
        return this;
    }
}

module.exports = ApiFeatures;