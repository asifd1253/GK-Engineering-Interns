const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

(async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/WIMERA_GK');

        // await mongoose.connect('mongodb://13.126.221.45:27018/WIMERA_GK');
        const db = mongoose.connection.db;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const endDate = new Date();

        const historicStages = await db.collection('processstages').find({
            updatedAt: { $gte: startDate, $lte: endDate },
            status: { $in: ['COMPLETED', 'PTC_VERIFIED', 'QI_SUBMITTED'] }
        }).toArray();

        console.log(`Found ${historicStages.length} historic stages.`);
        if (historicStages.length > 0) {
            console.log('Sample Stage Keys:', Object.keys(historicStages[0]));
            console.log('Sample Stage workOrderId:', historicStages[0].workOrderId);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
