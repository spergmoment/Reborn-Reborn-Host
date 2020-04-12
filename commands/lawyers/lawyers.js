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
const { Command, CommandResult } = require('patron.js');
const { config } = require('../../services/data.js');
const discord = require('../../utilities/discord.js');
const util = require('../../utilities/util.js');
const system = require('../../utilities/system.js');

module.exports = new class Lawyers extends Command {
  constructor() {
    super({
      description: 'View the lawyers.',
      groupName: 'lawyers',
      names: ['lawyers', 'lawyers_leaderboard', 'top_lawyers']
    });
  }

  async run(msg) {
    const lawyers = system.get_top_lawyers(msg.channel.guild);

    if (!lawyers.length) {
      return CommandResult.fromError('There are no lawyers on the leaderboards.');
    }

    let desc = '';

    for (let i = 0; i < lawyers.length; i++) {
      const member = msg.channel.guild.members.get(lawyers[i].member_id);

      if (!member) {
        lawyers.splice(i--, 1);
        continue;
      } else if (i + 1 > config.lawyer_leaderboard) {
        break;
      }

      const record = system.get_win_percent(lawyers[i].member_id, msg.channel.guild);
      const user = util.escape_markdown(discord.tag(member.user));
      const win_loss = `${record.wins} wins, ${record.losses} losses`;

      desc += `${i + 1}. **${user}** ${win_loss}\n`;
    }

    const footer = {
      text: `Use ${config.prefix}lawyer @User for more info`
    };

    return discord.send_msg(msg, desc, 'The Top Lawyers', footer, null, false);
  }
}();
