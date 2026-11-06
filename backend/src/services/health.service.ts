import { config } from '../config/env';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    system: string;
    memoryUsageMB: number;
    nodeVersion: string;
  };
}

export class HealthService {
  private readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  public getHealthStatus(): HealthStatus {
    const memory = process.memoryUsage();
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      status: 'healthy',
      service: 'payguard-ai-backend',
      version: '1.0.0',
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      checks: {
        system: 'operational',
        memoryUsageMB: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
        nodeVersion: process.version,
      },
    };
  }
}

export const healthService = new HealthService();
