const mongoose = require('mongoose');

module.exports = (mongooseConnection) => {
   const credentialSchema = new mongoose.Schema({
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      name: { type: String, required: true },
      username: { type: String, unique: true },
      userpass: { type: String, required: true },
      active: { type: Boolean, required: true, default: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
      lastLogin: Date,
      auth: [
         {
            authApp: { type: String, required: true },
            authLvl: { type: [String], required: true },
            appPass: { type: String, default: "" }
         }
      ]
   }, { collection: 'Credenciais' });

   return mongooseConnection.model('Credentials', credentialSchema);
};


/*
const mongoose = require('mongoose');

const AuthSchema = new mongoose.Schema({
   name: String,
   username: { type: String, unique: true },
   userpass: String,
   active: Boolean,
   createdAt: Date,
   updatedAt: Date,
   lastLogin: Date,
   auth: [
      {
         authApp: String,
         authLvl: [String],
         appPass: String,
      }
   ]
});

module.exports = mongoose.model('Credential', AuthSchema);
*/