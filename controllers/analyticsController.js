const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

const getHostAnalytics = async (req, res) => {
  try {
    const hostId = req.user._id;

    // Get all events created by this host
    const events = await Event.find({ createdBy: hostId });
    const eventIds = events.map(event => event._id);

    // Get all tickets for host's events
    const tickets = await Ticket.find({ eventId: { $in: eventIds } });

    // Calculate analytics
    const totalEvents = events.length;
    const totalAttendees = tickets.length;
    const totalRevenue = tickets.reduce((sum, ticket) => sum + (ticket.price || 0), 0);
    const totalTickets = tickets.length;

    // Monthly revenue data
    const monthlyRevenue = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const monthTickets = tickets.filter(ticket => {
        const ticketDate = new Date(ticket.createdAt);
        return ticketDate >= monthStart && ticketDate <= monthEnd;
      });

      const monthRevenue = monthTickets.reduce((sum, ticket) => sum + (ticket.price || 0), 0);
      
      monthlyRevenue.push({
        name: date.toLocaleDateString('en-US', { month: 'short' }),
        revenue: monthRevenue,
        tickets: monthTickets.length
      });
    }

    // Calculate trends (comparing to previous month)
    const currentMonth = monthlyRevenue[monthlyRevenue.length - 1];
    const previousMonth = monthlyRevenue[monthlyRevenue.length - 2];

    const revenueTrend = previousMonth?.revenue ? 
      ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue * 100).toFixed(1) : 0;
    
    const ticketsTrend = previousMonth?.tickets ? 
      ((currentMonth.tickets - previousMonth.tickets) / previousMonth.tickets * 100).toFixed(1) : 0;

    const analytics = {
      totalEvents,
      totalAttendees,
      totalRevenue,
      totalTickets,
      avgEventRevenue: totalEvents > 0 ? Math.round(totalRevenue / totalEvents) : 0,
      monthlyRevenue,
      revenueTrend: parseFloat(revenueTrend),
      ticketsTrend: parseFloat(ticketsTrend),
      eventsTrend: 0, // You can calculate this based on your requirements
      attendeesTrend: parseFloat(ticketsTrend) // Same as tickets for now
    };

    res.status(200).json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics',
      error: error.message
    });
  }
};

module.exports = {
  getHostAnalytics
};
