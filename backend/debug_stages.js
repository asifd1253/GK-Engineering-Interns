const mongoose = require('mongoose');
(async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/WIMERA_GK');
        // await mongoose.connect('mongodb://13.126.221.45:27018/WIMERA_GK');
        const db = mongoose.connection.db;
        const stage = await db.collection('processstages').findOne({ 'machineAssignments.0': { $exists: true } });
        console.log('Stage with assignments:', JSON.stringify(stage, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
