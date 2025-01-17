import express from 'express';

import { router as v1Router } from './routes/v1';

const app = express();

app.use("/api/v1")