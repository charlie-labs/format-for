import { expect, test } from 'bun:test';

import { helloWorld } from './index.js';

test('helloWorld', () => {
  expect(helloWorld()).toBe('Hello World!');
});
