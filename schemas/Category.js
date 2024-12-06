module.exports = (mongooseConnection) => {
   const categorySchema = new mongooseConnection.Schema({
      _id: { type: mongooseConnection.Schema.Types.ObjectId, auto: true },
      label: { type: String, required: true },
      value: { type: String, required: true, unique: true },
      technical: { type: [String], default: [] },
      subCategories: { type: [this], default: [] }, // Reference subcategories
      format: { type: [String], default: [] }
   }, { collection: 'CategoriasProd' });

   return mongooseConnection.model('Category', categorySchema);
};