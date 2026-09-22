require('dotenv').config();

const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const config = require('./config');

async function main() {
  if (!config.mongodb.uri) throw new Error('MONGODB_URI is not set');
  const client = new MongoClient(config.mongodb.uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(config.mongodb.db);

  const now = new Date().toISOString();
  const ownerPassword = process.env.OWNER_PASSWORD || 'password123';
  const employeePassword = process.env.EMPLOYEE_PASSWORD || 'password123';

  const users = [
    { username: 'owner', name: 'เจ้าของกิจการ', role: 'owner', password: ownerPassword },
    { username: 'employee', name: 'พนักงาน', role: 'employee', password: employeePassword },
  ];

  for (const item of users) {
    const existing = await db.collection('users').findOne({ username: item.username });
    if (existing) {
      await db.collection('users').updateOne(
        { username: item.username },
        { $set: { name: item.name, role: item.role, is_active: 1, updated_at: now } },
      );
      console.log(`updated ${item.username}`);
    } else {
      await db.collection('users').insertOne({
        username: item.username,
        name: item.name,
        role: item.role,
        phone: '',
        password_hash: await bcrypt.hash(item.password, 10),
        is_active: 1,
        created_at: now,
        updated_at: now,
      });
      console.log(`created ${item.username}`);
    }
  }

  for (const item_type of ['ดีเซล', 'น้ำมันเครื่อง', 'แอดบลู']) {
    await db.collection('stocks').updateOne(
      { item_type },
      { $setOnInsert: { item_type, balance_liters: 0, created_at: now }, $set: { updated_at: now } },
      { upsert: true },
    );
  }

  await client.close();
  console.log('seed completed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
