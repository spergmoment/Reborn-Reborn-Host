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
const { Argument, Command, CommandResult } = require('patron.js');
const db = require('../../services/database.js');
const system = require('../../utilities/system.js');
const bitfield = 2112;

module.exports = new class AddPublicChannel extends Command {
  constructor() {
    super({
      preconditions: ['guild_db_exists'],
      args: [
        new Argument({
          example: 'free',
          key: 'channel',
          name: 'channel',
          type: 'textchannel',
          remainder: true
        })
      ],
      description: 'Adds a public channel.',
      groupName: 'owners',
      names: ['add_public_channel']
    });
  }

  async run(msg, args) {
    const result = system._existing_pub_channel(msg.channel.guild.id, args.channel);

    if (result.existing) {
      return CommandResult.fromError('This channel is already a public channel');
    }

    const channel = {
      guild_id: msg.channel.guild.id,
      channel_id: args.channel.id
    };

    db.insert('public_channels', channel);
    await this.add_overwrites(msg.channel.guild, args.channel);
    await system._public_channel(msg, args.channel, 'added');
  }

  async add_overwrites(guild, channel) {
    const res = db.fetch('guilds', { guild_id: guild.id });
    const jailed = system.jailed_roles.filter(x => res[x] && guild.roles.has(res[x]));

    for (let i = 0; i < jailed.length; i++) {
      const role = jailed[i];

      await channel.editPermission(res[role], 0, bitfield, 'role', 'Overwrites for public channel');
    }
  }
}();
