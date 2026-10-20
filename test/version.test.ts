import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { VERSION } from '../src/version.js';

it('testVersionCoincideConPackageJson', () => {
  const paquete = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  expect(VERSION).toBe(paquete.version);
});

it('testServerJsonCoincideConPackageJson', () => {
  const paquete = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
    name: string;
    mcpName: string;
  };
  const registro = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8')) as {
    name: string;
    version: string;
    packages: { identifier: string; version: string }[];
  };
  expect(registro.name).toBe(paquete.mcpName);
  expect(registro.version).toBe(paquete.version);
  expect(registro.packages[0]).toMatchObject({ identifier: paquete.name, version: paquete.version });
});
