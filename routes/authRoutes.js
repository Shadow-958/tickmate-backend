const express = require('express');
const { 
  register, 
  login, 
  selectRole, 
  getMe, 
  updateProfile 
} = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register',register);
router.post('/login', login);
router.post('/select-role', authenticate, selectRole);
router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, updateProfile);

module.exports = router;