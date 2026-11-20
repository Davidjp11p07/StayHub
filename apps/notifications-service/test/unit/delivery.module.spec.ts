import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DELIVERY_ADAPTERS, type DeliveryPort } from '../../src/application/ports/delivery.port';
import { NOTIFICATIONS_CONFIG } from '../../src/infrastructure/config/notifications-config';
import { DeliveryModule } from '../../src/infrastructure/delivery/delivery.module';
import { FakeEmailAdapter } from '../../src/infrastructure/delivery/fake-email.adapter';
import { SmtpEmailAdapter } from '../../src/infrastructure/delivery/smtp-email.adapter';
import { InAppAdapter } from '../../src/infrastructure/delivery/in-app.adapter';

@Global()
@Module({ providers: [{ provide: NOTIFICATIONS_CONFIG, useValue: {} }], exports: [NOTIFICATIONS_CONFIG] })
class TestConfigModule {}

describe('notification channel registration', () => {
  it.each(['stub', 'smtp'])('registers the selected email channel together with in-app for %s', async mode => {
    const module = await Test.createTestingModule({ imports: [TestConfigModule, DeliveryModule] })
      .overrideProvider(NOTIFICATIONS_CONFIG).useValue({ email: { mode } }).compile();
    try {
      const adapters = module.get<DeliveryPort[]>(DELIVERY_ADAPTERS);
      expect(adapters).toHaveLength(2);
      expect(adapters[0]).toBeInstanceOf(mode === 'smtp' ? SmtpEmailAdapter : FakeEmailAdapter);
      expect(adapters[1]).toBeInstanceOf(InAppAdapter);
    } finally {
      await module.close();
    }
  });
});
