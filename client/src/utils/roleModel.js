/*
 * Copyright 2017-2019 EPAM Systems, Inc. (https://www.epam.com/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import {inject, observer} from 'mobx-react';

const bitEnabled = (bit, mask) => {
  return (mask & bit) === bit;
};

const readAllowed = (item, extendedMask = false) => {
  if (!item || item.mask === undefined || item.mask === null) {
    return false;
  }
  if (extendedMask) {
    return bitEnabled(1, collapseMask(item.mask));
  }
  return bitEnabled(1, item.mask);
};

const writeAllowed = (item, extendedMask = false) => {
  if (!item || item.mask === undefined || item.mask === null) {
    return false;
  }
  if (extendedMask) {
    return bitEnabled(2, collapseMask(item.mask));
  }
  return bitEnabled(2, item.mask);
};

const executeAllowed = (item, extendedMask = false) => {
  if (!item || item.mask === undefined || item.mask === null) {
    return false;
  }
  if (extendedMask) {
    return bitEnabled(4, collapseMask(item.mask));
  }
  return bitEnabled(4, item.mask);
};

const readDenied = (item, extendedMask = false) => {
  if (!item || item.mask === undefined || item.mask === null) {
    return false;
  }
  if (extendedMask) {
    return bitEnabled(1 << 1, item.mask);
  }
  return !bitEnabled(1, item.mask);
};

const writeDenied = (item, extendedMask = false) => {
  if (!item || item.mask === undefined || item.mask === null) {
    return false;
  }
  if (extendedMask) {
    return bitEnabled(1 << 3, item.mask);
  }
  return !bitEnabled(2, item.mask);
};

const executeDenied = (item, extendedMask = false) => {
  if (!item || item.mask === undefined || item.mask === null) {
    return false;
  }
  if (extendedMask) {
    return bitEnabled(1 << 5, item.mask);
  }
  return !bitEnabled(4, item.mask);
};

const isOwner = (item, extendedMask = false) => {
  if (!item || item.mask === undefined || item.mask === null) {
    return false;
  }
  if (extendedMask) {
    return bitEnabled(8, collapseMask(item.mask));
  }
  return bitEnabled(8, item.mask);
};

const extendMask = (mask) => {
  return (
    readAllowed({mask}) |
    !readAllowed({mask}) << 1 |
    writeAllowed({mask}) << 2 |
    !writeAllowed({mask}) << 3 |
    executeAllowed({mask}) << 4 |
    !executeAllowed({mask}) << 5
  );
};

const collapseMask = (mask) => {
  let readAllowed = (mask & 1) === 1;
  let writeAllowed = (mask & 4) === 4;
  let executeAllowed = (mask & 16) === 16;
  return readAllowed | writeAllowed << 1 | executeAllowed << 2;
};

const buildMask = (read, write, execute, extendedMask = false) => {
  const mask = (read ? 1 : 0) | ((write ? 1 : 0) << 1) | ((execute ? 1 : 0) << 2);
  if (extendedMask) {
    return extendedMask(mask);
  }
  return mask;
};

const buildPermissionsMask = (ra, rd, wa, wd, ea, ed) => {
  const buildBit = (bit, shift) => bit ? (1 << shift) : 0;
  return (
    buildBit(ra, 0) |
    buildBit(rd, 1) |
    buildBit(wa, 2) |
    buildBit(wd, 3) |
    buildBit(ea, 4) |
    buildBit(ed, 5)
  );
};

const management = (roleName) => (WrappedComponent, key) => {
  const Component = inject('authenticatedUserInfo')(
    observer(
      ({authenticatedUserInfo}) => {
        if (authenticatedUserInfo.loaded &&
          (authenticatedUserInfo.value.admin ||
          (authenticatedUserInfo.value.roles || []).filter(r => r.name === roleName).length === 1)) {
          return WrappedComponent;
        }
        return null;
      }
    )
  );
  return <Component key={key} />;
};

const hasRole = (roleName) => ({props}) => {
  const {authenticatedUserInfo} = props;
  if (authenticatedUserInfo && authenticatedUserInfo.loaded) {
    return authenticatedUserInfo.value.admin ||
      (authenticatedUserInfo.value.roles || []).filter(r => r.name === roleName).length === 1;
  }
  return false;
};

const userHasRole = (user, roleName) => {
  if (user && user.roles && user.roles.length > 0 && roleName) {
    return user.admin || (user.roles || []).find(r => r.name === roleName);
  }
  return false;
};

const authenticationInfo = (...opts) => inject('authenticatedUserInfo')(...opts);

const refreshAuthenticationInfo = async ({props}) => {
  if (props) {
    const {authenticatedUserInfo} = props;
    if (authenticatedUserInfo) {
      return authenticatedUserInfo.fetch();
    }
  }
};

const manager = {
  pipeline: management('ROLE_PIPELINE_MANAGER'),
  folder: management('ROLE_FOLDER_MANAGER'),
  configuration: management('ROLE_CONFIGURATION_MANAGER'),
  storage: management('ROLE_STORAGE_MANAGER'),
  toolGroup: management('ROLE_TOOL_GROUP_MANAGER'),
  entities: management('ROLE_ENTITIES_MANAGER'),
  billing: management('ROLE_BILLING_MANAGER')
};

const isManager = {
  pipeline: hasRole('ROLE_PIPELINE_MANAGER'),
  folder: hasRole('ROLE_FOLDER_MANAGER'),
  configuration: hasRole('ROLE_CONFIGURATION_MANAGER'),
  storage: hasRole('ROLE_STORAGE_MANAGER'),
  toolGroup: hasRole('ROLE_TOOL_GROUP_MANAGER'),
  entities: hasRole('ROLE_ENTITIES_MANAGER'),
  billing: hasRole('ROLE_BILLING_MANAGER')
};

export default {
  readAllowed,
  readDenied,
  writeAllowed,
  writeDenied,
  executeAllowed,
  executeDenied,
  isOwner,
  extendMask,
  collapseMask,
  manager,
  isManager,
  hasRole,
  userHasRole,
  authenticationInfo,
  refreshAuthenticationInfo,
  buildMask,
  buildPermissionsMask
};
