import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB.");
  
  const trucks = await mongoose.connection.db.collection('trucks').find().toArray();
  console.log("Trucks count:", trucks.length);
  trucks.slice(0, 5).forEach((t) => {
    console.log(`Truck ID: ${t.truckId} | _id: ${t._id}`);
  });
  
  process.exit(0);
}

run();
