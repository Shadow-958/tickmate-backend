// backend/controllers/hostAnalyticsController.js - COMPLETE UPDATED FILE

const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

const getHostAnalytics = async (req, res) => {
  try {
    const hostId = req.user._id;

    // Validate hostId exists
    if (!hostId) {
      return res.status(400).json({
        success: false,
        message: 'Host user ID not found'
      });
    }

    // Get all events created by this host
    // NOTE: Use 'host' field if your Event uses that for ownership (not 'createdBy')
    const events = await Event.find({ host: hostId });
    const eventIds = events.map(event => event._id);

    if (eventIds.length === 0) {
      // No events found - return zeroed analytics
      return res.status(200).json({
        success: true,
        analytics: {
          totalEvents: 0,
          totalAttendees: 0,
          totalRevenue: 0,
          totalTickets: 0,
          avgEventRevenue: 0,
          monthlyRevenue: [],
          revenueTrend: 0,
          ticketsTrend: 0,
          eventsTrend: 0,
          attendeesTrend: 0
        }
      });
    }

    // Get all tickets for host's events
    const tickets = await Ticket.find({ eventId: { $in: eventIds } });

    // Calculate analytics
    const totalEvents = events.length;
    const totalAttendees = tickets.length;
    const totalRevenue = tickets.reduce((sum, ticket) => sum + (ticket.pricePaid || 0), 0); // Use pricePaid field
    const totalTickets = tickets.length;

    // Monthly revenue data for last 12 months
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
      const monthRevenue = monthTickets.reduce((sum, ticket) => sum + (ticket.pricePaid || 0), 0);

      monthlyRevenue.push({
        name: date.toLocaleDateString('en-US', { month: 'short' }),
        revenue: monthRevenue,
        tickets: monthTickets.length
      });
    }

    // Calculate trends (comparing current vs previous month)
    const currentMonth = monthlyRevenue[monthlyRevenue.length - 1];
    const previousMonth = monthlyRevenue[monthlyRevenue.length - 2];

    const revenueTrend = previousMonth?.revenue && previousMonth.revenue !== 0
      ? ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue * 100).toFixed(1)
      : 0;

    const ticketsTrend = previousMonth?.tickets && previousMonth.tickets !== 0
      ? ((currentMonth.tickets - previousMonth.tickets) / previousMonth.tickets * 100).toFixed(1)
      : 0;

    // You can add logic for eventsTrend and attendeesTrend here if needed
    const analytics = {
      totalEvents,
      totalAttendees,
      totalRevenue,
      totalTickets,
      avgEventRevenue: totalEvents > 0 ? Math.round(totalRevenue / totalEvents) : 0,
      monthlyRevenue,
      revenueTrend: parseFloat(revenueTrend),
      ticketsTrend: parseFloat(ticketsTrend),
      eventsTrend: 0,
      attendeesTrend: parseFloat(ticketsTrend)
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
