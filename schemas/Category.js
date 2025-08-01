const mongoose = require('mongoose');

module.exports = (mongooseConnection) => {
   const categorySchema = new mongoose.Schema({
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      label: { type: String, required: true },
      value: { type: String, required: true, unique: true },
      technical: { type: [String], default: [] },
      subCategories: { type: [this], default: [] }, // Reference subcategories
      format: { type: [String], default: [] }
   }, { collection: 'CategoriasProd' });

   return mongooseConnection.model('Category', categorySchema);
};