import { config, StorageDriver } from '../config/env';
import {
  IAuthorizationDecisionRepository,
  InMemoryDecisionRepository,
} from './decision.repository';
import {
  IPaymentRepository,
  InMemoryPaymentRepository,
} from './payment.repository';
import { PrismaDecisionRepository } from './prisma.decision.repository';
import { PrismaPaymentRepository } from './prisma.payment.repository';

export interface RepositoryBundle {
  decisionRepository: IAuthorizationDecisionRepository;
  paymentRepository: IPaymentRepository;
  driver: StorageDriver;
}

/**
 * Creates an authorization decision repository based on the specified storage driver.
 */
export function createDecisionRepository(
  driver: StorageDriver = config.storageDriver
): IAuthorizationDecisionRepository {
  if (driver === 'postgres') {
    return new PrismaDecisionRepository();
  }
  return new InMemoryDecisionRepository();
}

/**
 * Creates a payment repository based on the specified storage driver.
 */
export function createPaymentRepository(
  driver: StorageDriver = config.storageDriver
): IPaymentRepository {
  if (driver === 'postgres') {
    return new PrismaPaymentRepository();
  }
  return new InMemoryPaymentRepository();
}

/**
 * Creates both repositories as a bundle based on the specified storage driver.
 */
export function createRepositories(
  driver: StorageDriver = config.storageDriver
): RepositoryBundle {
  return {
    decisionRepository: createDecisionRepository(driver),
    paymentRepository: createPaymentRepository(driver),
    driver,
  };
}

export const decisionRepository = createDecisionRepository();
export const paymentRepository = createPaymentRepository();

