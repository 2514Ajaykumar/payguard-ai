import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyService } from '../services/policy.service';

describe('Policy Service Tests', () => {
  it('returns default policy on initialization', () => {
    const service = new PolicyService();
    const policy = service.getPolicy();

    assert.equal(policy.autoApprovalMaxAmount, 100);
    assert.equal(policy.reviewThresholdMaxAmount, 500);
    assert.ok(policy.supportedCurrencies.includes('USD'));
    assert.ok(policy.blockedCategories.includes('crypto'));
  });

  it('updates policy values with valid parameters', () => {
    const service = new PolicyService();
    const updated = service.updatePolicy({
      autoApprovalMaxAmount: 150,
      reviewThresholdMaxAmount: 600,
    });

    assert.equal(updated.autoApprovalMaxAmount, 150);
    assert.equal(updated.reviewThresholdMaxAmount, 600);
  });

  it('rejects update if autoApprovalMaxAmount exceeds reviewThresholdMaxAmount', () => {
    const service = new PolicyService();
    assert.throws(
      () => {
        service.updatePolicy({
          autoApprovalMaxAmount: 700,
          reviewThresholdMaxAmount: 500,
        });
      },
      /cannot exceed reviewThresholdMaxAmount/
    );
  });

  it('rejects invalid or non-positive amount limits', () => {
    const service = new PolicyService();
    assert.throws(
      () => {
        service.updatePolicy({ autoApprovalMaxAmount: -20 });
      },
      /must be a positive finite number/
    );

    assert.throws(
      () => {
        service.updatePolicy({ reviewThresholdMaxAmount: NaN });
      },
      /must be a positive finite number/
    );
  });

  it('rejects empty currency list', () => {
    const service = new PolicyService();
    assert.throws(
      () => {
        service.updatePolicy({ supportedCurrencies: [] });
      },
      /must be a non-empty array/
    );
  });

  it('resets policies to default', () => {
    const service = new PolicyService();
    service.updatePolicy({ autoApprovalMaxAmount: 200, reviewThresholdMaxAmount: 800 });
    assert.equal(service.getPolicy().autoApprovalMaxAmount, 200);

    const reset = service.resetPolicy();
    assert.equal(reset.autoApprovalMaxAmount, 100);
    assert.equal(reset.reviewThresholdMaxAmount, 500);
  });
});
