const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');
const User = require('./models/User');

let io = null;

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const userId = socket.handshake.auth.userId;

    if (!token || !userId) {
      return next(new Error('Authentication error: Missing token or userId'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(userId).select('-password');
    
    if (!user || user._id.toString() !== decoded.id) {
      return next(new Error('Authentication error: Invalid user'));
    }

    // Attach user to socket
    socket.user = user;
    console.log(`✅ Socket authenticated: ${user.firstName} ${user.lastName} (${user.selectedRole})`);
    
    next();
  } catch (error) {
    console.error('❌ Socket authentication error:', error.message);
    next(new Error('Authentication error: ' + error.message));
  }
};

// Initialize Socket.IO server
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Apply authentication middleware
  io.use(authenticateSocket);

  // Handle connections
  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`🔌 Client connected: ${user.firstName} ${user.lastName} (${socket.id})`);

    // Join user to their personal room
    socket.join(`user_${user._id}`);
    
    // Join staff room if user is staff
    if (user.selectedRole === 'event_staff' || user.selectedRole === 'event_host') {
      socket.join(`staff_${user._id}`);
    }

    // ===== ROOM MANAGEMENT EVENTS =====

    // Join event room
    socket.on('join_event', (eventId) => {
      if (!eventId) return;
      
      console.log(`📍 User ${user.firstName} joining event room: event_${eventId}`);
      socket.join(`event_${eventId}`);
      
      socket.emit('room_joined', { 
        room: `event_${eventId}`,
        message: `Joined event ${eventId} for live updates`
      });
    });

    // Leave event room
    socket.on('leave_event', (eventId) => {
      if (!eventId) return;
      
      console.log(`📍 User ${user.firstName} leaving event room: event_${eventId}`);
      socket.leave(`event_${eventId}`);
      
      socket.emit('room_left', { 
        room: `event_${eventId}`,
        message: `Left event ${eventId}`
      });
    });

    // Join staff room
    socket.on('join_staff_room', (userId) => {
      if (user.selectedRole !== 'event_staff' && user.selectedRole !== 'event_host') {
        return socket.emit('error', { message: 'Access denied: Staff role required' });
      }
      
      console.log(`👥 Staff ${user.firstName} joining staff room`);
      socket.join(`staff_${userId}`);
      
      socket.emit('room_joined', { 
        room: `staff_${userId}`,
        message: 'Joined staff room for updates'
      });
    });

    // Leave staff room
    socket.on('leave_staff_room', (userId) => {
      console.log(`👥 Staff ${user.firstName} leaving staff room`);
      socket.leave(`staff_${userId}`);
      
      socket.emit('room_left', { 
        room: `staff_${userId}`,
        message: 'Left staff room'
      });
    });

    // ===== UTILITY EVENTS =====

    // Ping/Pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Get connected rooms
    socket.on('get_rooms', () => {
      const rooms = Array.from(socket.rooms);
      socket.emit('current_rooms', { rooms });
    });

    // ===== DISCONNECT HANDLER =====
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client disconnected: ${user.firstName} ${user.lastName} (${reason})`);
    });

    // ===== ERROR HANDLER =====
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${user.firstName}:`, error);
    });
  });

  console.log('🚀 Socket.IO server initialized');
  return io;
};

// Get the Socket.IO instance
const getSocketIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized! Call initSocket first.');
  }
  return io;
};

// Utility functions for emitting events
const emitToRoom = (room, event, data) => {
  if (!io) {
    console.warn('⚠️ Socket.IO not initialized, cannot emit event');
    return;
  }
  
  console.log(`📤 Emitting '${event}' to room '${room}'`);
  io.to(room).emit(event, data);
};

const emitToUser = (userId, event, data) => {
  if (!io) {
    console.warn('⚠️ Socket.IO not initialized, cannot emit event');
    return;
  }
  
  console.log(`📤 Emitting '${event}' to user '${userId}'`);
  io.to(`user_${userId}`).emit(event, data);
};

const emitToEvent = (eventId, event, data) => {
  if (!io) {
    console.warn('⚠️ Socket.IO not initialized, cannot emit event');
    return;
  }
  
  console.log(`📤 Emitting '${event}' to event '${eventId}'`);
  io.to(`event_${eventId}`).emit(event, data);
};

const emitToAllStaff = (event, data) => {
  if (!io) {
    console.warn('⚠️ Socket.IO not initialized, cannot emit event');
    return;
  }
  
  console.log(`📤 Broadcasting '${event}' to all staff`);
  io.emit(event, data);
};

module.exports = {
  initSocket,
  getSocketIO,
  emitToRoom,
  emitToUser,
  emitToEvent,
  emitToAllStaff
};
