const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/WIMERA_GK');

    // await mongoose.connect('mongodb://13.126.221.45:27018/WIMERA_GK');
    const db = mongoose.connection.db;

    const stage = await db
      .collection('processstages')
      .findOne({ machineId: 'MC-001' });
    console.log('Sample Stage workOrderId:', stage.workOrderId);

    const woByString = await db
      .collection('workorders')
      .findOne({ _id: stage.workOrderId });
    console.log('Find WO by String:', !!woByString);

    const woByObjectId = await db
      .collection('workorders')
      .findOne({ _id: new ObjectId(stage.workOrderId) });
    console.log('Find WO by ObjectId:', !!woByObjectId);

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
