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
const { Argument, Command, Context, CommandResult } = require('patron.js');
const db = require('../../services/database.js');
const discord = require('../../utilities/discord.js');
const number = require('../../utilities/number.js');

module.exports = new class Announce extends Command {
  constructor() {
    super({
      args: [
        new Argument({
          example: 'Reborn',
          key: 'text',
          name: 'text',
          type: 'string',
          remainder: true
        }),
      ],
      description: 'Create an announcement.',
      groupName: 'owners',
      names: ['announce', 'announcement']
    });
  }

  async run(msg, args) {
    const guild = db.fetch('guilds', { guild_id: msg.channel.guild.id });
    const channel = await msg.channel.guild.channels.get(guild.announcement_channel);

    if (!channel) {
      return CommandResult.fromError('There is no announcement channel set in this server.');
    }

    await discord.send_msg(msg, `I have created an announcement in the announcements channel.`);

    return channel.createMessage(`Announcement by ${msg.author.mention}!\n${args.text}`);
  }
}();