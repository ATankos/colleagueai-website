/**
 * api/demo-booking.js – Handle demo booking form submissions
 * Receives: email, company, role, agentsOfInterest[], preferredDate, timeZone
 * Sends: email notification to team, confirmation to user
 */

export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, company, role, agentsOfInterest, preferredDate, timeZone } = req.body || {};

  // Validate required fields
  if (!email || !company || !role || !preferredDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const interests = Array.isArray(agentsOfInterest) ? agentsOfInterest : [];

  try {
    // Log booking (in production, send to CRM/email service)
    console.log('[Demo Booking]', {
      timestamp: new Date().toISOString(),
      email,
      company,
      role,
      agentsOfInterest: interests.length > 0 ? interests.join(', ') : 'None specified',
      preferredDate,
      timeZone,
    });

    // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    // await sendBookingEmail({
    //   to: 'demo@colleagueai.ai',
    //   subject: `New Demo Request from ${company}`,
    //   html: `<p>Email: ${email}</p><p>Company: ${company}</p>...`
    // });

    // TODO: Send confirmation email to user
    // await sendConfirmationEmail({
    //   to: email,
    //   subject: 'Your ColleagueAI Demo Request',
    //   template: 'demo-confirmation'
    // });

    // Success response
    return res.status(200).json({
      success: true,
      message: 'Demo request received. We will contact you within 24 hours.',
      bookingId: `DEMO-${Date.now()}`,
    });
  } catch (error) {
    console.error('[Demo Booking Error]', error);
    return res.status(500).json({
      error: 'Failed to process demo request',
      message: error.message,
    });
  }
}
