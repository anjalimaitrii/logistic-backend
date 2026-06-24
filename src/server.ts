import './loadEnv.js';
import { createServer } from 'http';
import app from './app.js';
import connectDB from './config/db.js';
import { initSocket } from './socket.js';
import { startNightAlertCron } from './services/nightAlertService.js';

connectDB();

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startNightAlertCron();
});
