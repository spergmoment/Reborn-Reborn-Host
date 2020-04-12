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
const db = require('../../services/database.js');
const discord = require('../../utilities/discord.js');

module.exports = new class ResetUser extends Command {
  constructor() {
    super({
      args: [
        new Argument({
          name: 'user',
          key: 'user',
          type: 'user',
          example: 'Silver Bullet',
          remainder: true
        })
      ],
      preconditions: ['guild_db_exists'],
      description: 'Resets the a users balance.',
      groupName: 'owners',
      names: ['reset_user', 'reset_member']
    });
  }

  async run(msg, args) {
    db.reset_user(args.user.id, msg.channel.guild.id);

    const str = discord.get_tag_or_self(msg.author, args.user);

    await discord.send_msg(
      msg, `You have successfully reset ${str} balance.`
    );
  }
}();
