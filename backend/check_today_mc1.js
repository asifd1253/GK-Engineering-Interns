const mongoose = require('mongoose');
(async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/WIMERA_GK');
        // await mongoose.connect('mongodb://13.126.221.45:27018/WIMERA_GK');
        const db = mongoose.connection.db;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stages = await db.collection('processstages').find({
            machineId: 'MC-001',
            updatedAt: { $gte: today }
        }).toArray();

        console.log(`Found ${stages.length} stages for MC-001 today.`);
        for (const s of stages) {
            console.log(`- Stage ID: ${s._id}, WO ID: ${s.workOrderId}, Status: ${s.status}`);
            const wo = await db.collection('workorders').findOne({ _id: s.workOrderId });
            console.log(`  WO Status: ${wo ? wo.status : 'NOT_FOUND'}`);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
