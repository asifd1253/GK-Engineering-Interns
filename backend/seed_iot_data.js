const mongoose = require('mongoose');
const uri = 'mongodb://localhost:27017/WIMERA_GK';

// const uri = 'mongodb://13.126.221.45:27018/WIMERA_GK';
const gatewayId = 'MC-001';

const EquipmentAggSchema = new mongoose.Schema({
  fromTo: String,
  name: String,
  packet_id: Number,
  eqSts: Number,
  qlt: Number,
  partCnt: Number,
  itemStyle: Object,
  gatewayID: String,
  customerID: String,
  createdAt: Date
}, { collection: 'equipmentagg_test', versionKey: false });

const HourDataSchema = new mongoose.Schema({
  date: Date,
  gatewayId: String,
  shiftId: String,
  shiftName: String,
  hourNumber: Number,
  startTimestamp: Date,
  endTimestamp: Date,
  partProduced: Number,
  partRejected: Number,
  runTime: Number,
  idleTime: Number,
  oEE: Number,
  availability: Number,
  performance: Number,
  quality: Number,
  gatewayName: String,
  plantName: String,
  departmentName: String
}, { collection: 'hourdata', versionKey: false });

async function seed() {
  await mongoose.connect(uri);
  console.log('Connected to IoT DB');

  const Eq = mongoose.model('EquipmentAgg', EquipmentAggSchema);
  const Hd = mongoose.model('HourData', HourDataSchema);

  const now = new Date();

  // Clear existing for this gateway to avoid duplicates during test
  await Eq.deleteMany({ gatewayID: gatewayId });
  await Hd.deleteMany({ gatewayId: gatewayId });

  // 1. Generate Equipment Agg status logs (per User Format)
  const statusLogs = [
    { name: 'Running', sts: 1, cnt: 10, color: '#10b981', offset: -5 },
    { name: 'Idle', sts: 2, cnt: 0, color: '#f59e0b', offset: -4 },
    { name: 'Running', sts: 1, cnt: 15, color: '#10b981', offset: -3 },
    { name: 'Stopped', sts: 0, cnt: 0, color: '#ef4444', offset: -2 },
    { name: 'Running', sts: 1, cnt: 25, color: '#10b981', offset: -1 },
  ];

  for (const log of statusLogs) {
    const ts = new Date(now.getTime() + (log.offset * 3600000));
    await new Eq({
      fromTo: "Status Segment",
      name: log.name,
      packet_id: ts.getTime(),
      eqSts: log.sts,
      qlt: 192,
      partCnt: log.cnt,
      itemStyle: { normal: { color: log.color } },
      gatewayID: gatewayId,
      customerID: "GLOBAL",
      createdAt: ts
    }).save();
  }

  // 2. Generate HourData production (per User Format)
  for (let h = 8; h <= 20; h++) {
    const hDate = new Date(now);
    hDate.setHours(h, 0, 0, 0);

    const startTs = new Date(hDate);
    const endTs = new Date(hDate);
    endTs.setHours(h + 1);

    await new Hd({
      date: hDate,
      gatewayId: gatewayId,
      shiftId: h < 16 ? "1" : "2",
      shiftName: h < 16 ? "Day" : "Night",
      hourNumber: h,
      startTimestamp: startTs,
      endTimestamp: endTs,
      partProduced: Math.floor(Math.random() * 40) + 20,
      partRejected: Math.floor(Math.random() * 3),
      runTime: 3300 + Math.floor(Math.random() * 200),
      idleTime: 100 + Math.floor(Math.random() * 50),
      oEE: 80 + Math.floor(Math.random() * 15),
      availability: 90,
      performance: 95,
      quality: 100,
      gatewayName: `GateWay-${gatewayId}`,
      plantName: "KAVIA",
      departmentName: "PRODUCTION"
    }).save();
  }

  console.log('Seed completed for ' + gatewayId);
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
