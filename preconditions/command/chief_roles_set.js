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
const { Precondition, PreconditionResult } = require('patron.js');
const db = require('../../services/database.js');
const discord = require('../../utilities/discord.js');
const system = require('../../utilities/system.js');

module.exports = new class ChiefRolesSet extends Precondition {
  constructor() {
    super({ name: 'chief_roles_set' });
  }

  async run(cmd, msg) {
    const res = db.fetch('guilds', { guild_id: msg.channel.guild.id });
    const roles = Object.keys(res).filter(x => system.chief_roles.includes(x));
    const result = discord.valid_role(res, roles, msg.channel.guild);

    if (!result.success) {
      return PreconditionResult.fromError(cmd, result.reason);
    }

    return PreconditionResult.fromSuccess();
  }
}();
