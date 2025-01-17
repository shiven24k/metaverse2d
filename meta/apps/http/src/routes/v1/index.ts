import { Router } from 'express';

const router = Router();

router.get('/signup', (req, res) => {
  res.json({ message: 'Hello, world!' });
});

router.get('/signin', (req, res) => {
    res.json({ message: 'Hello, world!' });
  });