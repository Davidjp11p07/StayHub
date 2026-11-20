import type {
  RegisterAccountCommand,
  RegisterAccountResult,
  RegisterAccountUseCase,
} from '@auth/application/ports/auth-use-cases.port';
import type { Clock } from '@auth/application/ports/clock.port';
import type { UuidGenerator } from '@auth/application/ports/random.port';
import type { RegistrationWorkPort } from '@auth/application/ports/registration-work.port';
import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  RegistrationCancelledError,
  RegistrationConflictError,
} from '@auth/application/errors/auth-errors';
import type { RegistrationPolicy } from '@auth/domain/registrations/registration-policy';
import { Registration } from '@auth/domain/registrations/registration';
import {
  AdvanceRegistrationService,
  normalizeRegistrationInput,
  toRegistrationRole,
  type RegistrationUsersPort,
} from './advance-registration.service';

export interface RegisterAccountSettings {
  readonly ttlSeconds: number;
  readonly leaseSeconds: number;
}

export interface RegisterAccountDependencies {
  readonly work: RegistrationWorkPort;
  readonly users: RegistrationUsersPort;
  readonly policy: RegistrationPolicy;
  readonly advance: AdvanceRegistrationService;
  readonly clock: Clock;
  readonly uuids: UuidGenerator;
  readonly settings: RegisterAccountSettings;
}

export class RegisterAccountService implements RegisterAccountUseCase {
  private readonly work: RegistrationWorkPort;
  private readonly users: RegistrationUsersPort;
  private readonly policy: RegistrationPolicy;
  private readonly advance: AdvanceRegistrationService;
  private readonly clock: Clock;
  private readonly uuids: UuidGenerator;
  private readonly settings: RegisterAccountSettings;

  public constructor(dependencies: RegisterAccountDependencies) {
    this.work = dependencies.work;
    this.users = dependencies.users;
    this.policy = dependencies.policy;
    this.advance = dependencies.advance;
    this.clock = dependencies.clock;
    this.uuids = dependencies.uuids;
    this.settings = dependencies.settings;
  }

  public async execute(command: RegisterAccountCommand): Promise<RegisterAccountResult> {
    const now = this.clock.now();
    const input = normalizeRegistrationInput(command.input);
    const fingerprint = this.policy.fingerprint(input);
    const registrationId = command.idempotencyKey;
    const expiresAt = new Date(now.getTime() + this.settings.ttlSeconds * 1000);

    const candidate = Registration.create(registrationId, fingerprint, this.uuids.generate(), now, expiresAt);
    // Give the request carrying the password the first processing interval.
    // If it exits before acquiring the lease, the reconciler can still recover the row.
    candidate.scheduleNextAttempt(new Date(now.getTime() + this.settings.leaseSeconds * 1000), now);
    const existing = await this.work.createOrRead(candidate);
    const snapshot = existing.snapshot();
    if (snapshot.requestFingerprint !== fingerprint) throw new IdempotencyConflictError();
    if (snapshot.state === 'CANCELLED') throw new RegistrationCancelledError();
    if (snapshot.state === 'COMPLETED') {
      return this.publicSummary(registrationId, command.traceId);
    }

    const owner = this.uuids.generate();
    const claim = await this.work.claimOne(
      registrationId,
      owner,
      now,
      new Date(now.getTime() + this.settings.leaseSeconds * 1000),
    );
    if (claim.status === 'busy') {
      // Observe the existing owner without extending its lease or repeating the saga.
      for (const delayMs of [40, 80, 160, 320, 600]) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const current = await this.work.transaction(({ registrations }) => registrations.findById(registrationId));
        const state = current?.snapshot();
        if (!state || state.requestFingerprint !== fingerprint) break;
        if (state.state === 'COMPLETED') return this.publicSummary(registrationId, command.traceId);
        if (state.state === 'CANCELLED') throw new RegistrationCancelledError();
        if (!state.processingOwner) break;
      }
      throw new DependencyUnavailableError('registration');
    }
    if (claim.status === 'missing') {
      throw new DependencyUnavailableError('registration');
    }
    if (claim.status === 'terminal') {
      if (claim.registration.snapshot().state === 'CANCELLED') {
        throw new RegistrationCancelledError();
      }
      return this.publicSummary(registrationId, command.traceId);
    }

    let outcome: 'completed' | 'waiting';
    try {
      outcome = await this.advance.advance(claim.registration, input, command.traceId);
    } catch (error) {
      if (
        error instanceof IdempotencyConflictError ||
        error instanceof RegistrationConflictError ||
        error instanceof RegistrationCancelledError
      ) {
        throw error;
      }
      await this.advance.recordTransientFailure(claim.registration, owner);
      throw new DependencyUnavailableError('registration');
    }
    if (outcome !== 'completed') {
      await this.advance.recordTransientFailure(claim.registration, owner);
      throw new DependencyUnavailableError('registration');
    }
    await this.work.release(registrationId, owner, now);
    return this.publicSummary(registrationId, command.traceId);
  }

  private async publicSummary(
    registrationId: string,
    traceId: string,
  ): Promise<RegisterAccountResult> {
    const identity = await this.users.getRegistration(registrationId, traceId);
    if (identity === null) throw new DependencyUnavailableError('users');
    if (identity.status === 'CANCELLED') throw new RegistrationCancelledError();
    if (identity.status !== 'ACTIVE') throw new DependencyUnavailableError('users');
    return {
      id: identity.userId,
      name: identity.name,
      email: identity.email,
      role: toRegistrationRole(identity.role),
    };
  }
}
