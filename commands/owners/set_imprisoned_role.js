/**
 * Reborn - The core control of the only truly free and fair discord server.
 * Copyright (C) 2019 John Boyer
 *
 * Reborn is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Reborn is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
'use strict';
const { Argument, Command } = require('patron.js');
const system = require('../../utilities/system.js');

module.exports = new class SetImprisonedRole extends Command {
  constructor() {
    super({
      args: [
        new Argument({
          example: 'Imprisoned',
          key: 'role',
          name: 'role',
          type: 'role',
          preconditions: ['usable_role'],
          remainder: true
        })
      ],
      description: 'Sets the imprisoned role.',
      groupName: 'owners',
      names: ['set_imprisoned_role', 'set_imprisoned']
    });
  }

  async run(msg, args) {
    await system.set_db_property(
      msg, 'imprisoned_role', args.role.id, 'Imprisoned role', args.role.mention
    );
  }
}();
