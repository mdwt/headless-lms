import { requires, type Declarations } from '../shared/declarations.js';
import type { AssetsService } from './ports.js';

const reach = requires('media:read', 'courses:write', 'downloads:write', 'communities:write');

export const assetsDeclarations = {
  requestUpload: requires('media:write', 'courses:write', 'downloads:write', 'communities:write'),
  requestMemberUpload: 'member',
  confirm: reach,
  confirmOwn: 'member',
  list: reach,
  get: reach,
  libraryFile: reach,
  ownUploadFile: 'member',
  remove: requires('media:delete'),
  removeOwn: 'member',
  removeUnattached: 'system',
  ownsImage: 'system',
  ownsUpload: 'system',
  memberUploads: 'system',
  libraryAssetsFor: 'system',
  readyFiles: 'system',
  signFile: 'system',
} as const satisfies Declarations<AssetsService>;
