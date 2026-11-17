// Every window story (peek/stories-*.ts), in one list. window.ts gives each lit window one of them at random.
import type { Story } from './pen.js';
import { STORIES_A } from './stories-a.js';
import { STORIES_B } from './stories-b.js';
import { STORIES_C } from './stories-c.js';
import { STORIES_D } from './stories-d.js';

export const STORIES: Story[] = [...STORIES_A, ...STORIES_B, ...STORIES_C, ...STORIES_D];
