import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('OK'));
app.listen(3001, () => console.log('Test server on 3001'));
require("dotenv").config();
const paymentRoutes = require("./routes/payment");
app.use("/api/payment", paymentRoutes);