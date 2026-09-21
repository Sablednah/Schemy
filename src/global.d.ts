import type { SchematicBridge } from './platform';

export {};
declare global { interface Window { schematic?: SchematicBridge } }
