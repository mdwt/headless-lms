import type { Tool } from '../tool.js';
import { catalogTools } from './catalog.js';
import { courseTools } from './courses.js';

export const TOOLS: Tool[] = [...courseTools, ...catalogTools];
