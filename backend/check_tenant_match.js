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
      .limit(5)
      .toArray();
    for (const s of stages) {
      const wo = await db
        .collection('workorders')
        .findOne({ _id: s.workOrderId });
      console.log(
        `Stage ID: ${s._id} | StageTenant: ${s.tenantId} | WOTenant: ${wo ? wo.tenantId : 'NOT_FOUND'} | Match: ${wo && s.tenantId === wo.tenantId}`,
      );
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
