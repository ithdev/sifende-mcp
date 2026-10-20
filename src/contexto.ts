import type { Sifende } from '@sifende/sdk';
import type { Config } from './config.js';

export interface Contexto {
  sifende: Sifende;
  config: Config;
}

export const CDC = /^\d{44}$/;
