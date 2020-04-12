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
const db = require('../../services/database.js');
const reg = require('../../services/registry.js');
const { Precondition, PreconditionResult } = require('patron.js');

module.exports = new class Officers extends Precondition {
  constructor() {
    super({ name: 'officers' });
  }

  async run(cmd, msg) {
    const {
      officer_role, chief_officer_role
    } = db.fetch('guilds', { guild_id: msg.channel.guild.id });
    const is_chief = chief_officer_role && msg.member.roles.includes(chief_officer_role);
    const prec = reg.preconditions.find(x => x.name === 'usable_gov_role');
    const res = await prec.run(cmd, msg, { roles: ['officer_role'] });

    if (!res.success) {
      return PreconditionResult.fromError(cmd, res.errorReason);
    } else if (officer_role && (msg.member.roles.includes(officer_role) || is_chief)) {
      return PreconditionResult.fromSuccess();
    }

    return PreconditionResult.fromError(
      cmd, 'Only Officers can use this command.'
    );
  }
}();
