export interface ReadinessIndicator { isReady(): Promise<boolean> }
export const READINESS_INDICATOR = Symbol('READINESS_INDICATOR');
