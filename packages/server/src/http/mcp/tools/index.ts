import type { Tool } from '../tool.js';
import { catalogTools } from './catalog.js';
import { courseTools } from './courses.js';
import { peopleTools } from './people.js';

export const TOOLS: Tool[] = [...courseTools, ...catalogTools, ...peopleTools];
