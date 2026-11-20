import { createTransport } from 'nodemailer';
import type { NotificationsConfig } from '../../src/infrastructure/config/notifications-config';
import { SmtpEmailAdapter } from '../../src/infrastructure/delivery/smtp-email.adapter';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const mail = { recipientEmail: 'guest@example.test', subject: 'Booking', body: 'Confirmed' };
const smtp = { mode: 'smtp', host: 'mail.example.test', port: 587, from: 'host@example.test' } as const;
const unavailable = { accepted: false, failureCode: 'DELIVERY_UNAVAILABLE' };

function adapter(email: NotificationsConfig['email']): SmtpEmailAdapter {
  return new SmtpEmailAdapter({ email } as NotificationsConfig);
}

describe('SMTP delivery', () => {
  const sendMail = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(createTransport).mockReturnValue({ sendMail } as unknown as ReturnType<typeof createTransport>);
  });

  it.each([{ mode: 'stub' } as const, { ...smtp, host: '' }, { ...smtp, port: 0 }, { ...smtp, from: '' }])(
    'rejects delivery when SMTP is unavailable', async email => {
      expect(await adapter(email).deliver(mail)).toEqual(unavailable);
      expect(createTransport).not.toHaveBeenCalled();
    },
  );

  it('uses STARTTLS and checks the actual accepted recipient', async () => {
    const client = adapter(smtp);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, secure: undefined }));
    sendMail.mockResolvedValueOnce({ accepted: ['unrelated@example.test'] });
    expect(await client.deliver(mail)).toEqual(unavailable);
    sendMail.mockResolvedValueOnce({ accepted: [{ address: 'GUEST@example.test' }] });
    expect(await client.deliver(mail)).toEqual({ accepted: true });
  });

  it('handles missing recipients and transport failures', async () => {
    const client = adapter({ ...smtp, secure: true, user: 'test', password: 'synthetic' });
    expect(await client.deliver({ ...mail, recipientEmail: null })).toEqual(unavailable);
    expect(sendMail).not.toHaveBeenCalled();
    sendMail.mockRejectedValueOnce(new Error('test transport unavailable'));
    expect(await client.deliver(mail)).toEqual(unavailable);
  });
});
