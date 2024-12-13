
// to controller in data that we want to return in response
exports.sanitizeUser = function(user) {
    return {
      _id: user._id,
      name: user.name,
      email: user.email
    };
  };