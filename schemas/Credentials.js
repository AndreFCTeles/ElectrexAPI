const mongoose = require('mongoose');

module.exports = (mongooseConnection) => {
   const AppEntrySchema = new mongoose.Schema({
      roles: { type: String, default: 'user' },
      appPass: { type: String, default: null },
      audit: {
         created: {
            at: { type: Date, default: Date.now },
            by: { type: String, default: 'system' }
         },
         updated: {
            at: { type: Date, default: null },
            by: { type: String, default: null }
         }
      }
   }, { _id: false });


   const credentialSchema = new mongoose.Schema({
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      nome: { type: String, required: true },
      username: { type: String, required: true, unique: true },
      userpass: { type: String, default: null },
      active: { type: Boolean, default: true },
      status: { type: String, enum: ['ativo', 'desativado', 'bloqueado'], default: 'ativo' },
      email: { type: String, default: null },
      roles: { type: String, default: null },
      passwordUpdatedAt: { type: Date, default: Date.now },

      apps: {
         type: Map,
         of: AppEntrySchema,
         default: {}
      },

      audit: {
         created: {
            at: { type: Date, default: Date.now },
            by: { type: String, default: 'system' }
         },
         updated: {
            at: { type: Date, default: null },
            by: { type: String, default: null }
         },
         lastLogin: {
            at: { type: Date, default: null },
            ip: { type: String, default: null }
         }
      }
   }, { collection: 'Credenciais' });

   return mongooseConnection.model('Credentials', credentialSchema);
};
