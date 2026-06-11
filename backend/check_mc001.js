const mongoose = require('mongoose');
(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/WIMERA_GK');
    // await mongoose.connect('mongodb://13.126.221.45:27018/WIMERA_GK');

    const db = mongoose.connection.db;
    const stages = await db
      .collection('processstages')
      .find({ machineId: 'MC-001' })
      .sort({ updatedAt: -1 })
      .toArray();
    console.log(`Found ${stages.length} stages for MC-001`);
    if (stages.length > 0) {
      console.log(
        'Latest stage for MC-001:',
        JSON.stringify(stages[0], null, 2),
      );
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
