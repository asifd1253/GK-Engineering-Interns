const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/WIMERA_GK').then(() => {
// mongoose.connect('mongodb://13.126.221.45:27018/WIMERA_GK').then(() => {
  mongoose.connection.db.collection('machinetypes').updateOne(
    { machineType: 'MACHINE001' },
    { $set: { processCategory: 'MACHINING' } }
  ).then(res => {
    console.log('Updated:', res);
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
});
