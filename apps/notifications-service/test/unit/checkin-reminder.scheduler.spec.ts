import { CheckinReminderScheduler } from '../../src/infrastructure/scheduling/checkin-reminder.scheduler';
import type { SendNotificationUseCase } from '../../src/application/notifications/send-notification.use-case';

describe('check-in reminder delivery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('retries after a failed claim, records outcomes and stops polling on shutdown', async () => {
    const reminder = { id: 'scheduled-1', bookingId: 'booking-1', userId: 'guest-1',
      propertyName: 'Synthetic', roomName: 'Room', checkIn: '2030-02-03' };
    const reminders = {
      scheduleBookingReminder: jest.fn(),
      claimDueReminders: jest.fn().mockRejectedValueOnce(new Error('claim unavailable'))
        .mockResolvedValue([reminder]),
      completeReminder: jest.fn().mockResolvedValue(undefined),
    };
    const send = { execute: jest.fn().mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce({ notification: { status: 'FAILED' } })
      .mockResolvedValueOnce({ notification: { status: 'SENT' } }) };
    const scheduler = new CheckinReminderScheduler(reminders, send as unknown as SendNotificationUseCase);
    try {
      scheduler.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(90000);
      expect(send.execute).toHaveBeenCalledWith(expect.objectContaining({
        userId: reminder.userId, type: 'CHECKIN_REMINDER', idempotencyKey: 'checkin-reminder:booking-1',
      }));
      expect(reminders.completeReminder.mock.calls).toEqual([
        [reminder.id, 'FAILED'], [reminder.id, 'FAILED'], [reminder.id, 'SENT'],
      ]);
    } finally {
      scheduler.onModuleDestroy();
    }
    await jest.advanceTimersByTimeAsync(30000);
    expect(reminders.claimDueReminders).toHaveBeenCalledTimes(4);
  });
});
