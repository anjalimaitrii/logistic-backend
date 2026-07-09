import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB.");
  
  const drivers = await mongoose.connection.db.collection('drivers').find().toArray();
  console.log("Drivers count:", drivers.length);
  drivers.forEach((d) => {
    console.log(`Driver Name: ${d.name} | License: ${d.licenseNo}`);
  });
  
  process.exit(0);
}

run();
