# Partner Fraud-Control Checklist

## Required controls

- [ ] Partner code is sanitized
- [ ] Unknown partner code does not generate commission
- [ ] Partner code is stored in checkout metadata
- [ ] Commission is created only after successful paid checkout
- [ ] Duplicate webhook events do not duplicate commission
- [ ] Refunded payment reverses or freezes commission
- [ ] Chargeback reverses or freezes commission
- [ ] Buyer email cannot equal partner email unless manually approved
- [ ] Partner cannot use their own code for self-referral
- [ ] Payout ledger has status: pending, approved, paid, reversed
- [ ] Monthly payout date is documented
- [ ] Tax/KYC responsibility is documented
- [ ] Partner Agreement is accepted before activation
