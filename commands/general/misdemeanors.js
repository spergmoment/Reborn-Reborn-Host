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
const { Argument, Command, ArgumentDefault } = require('patron.js');
const { config } = require('../../services/data.js');
const discord = require('../../utilities/discord.js');
const system = require('../../utilities/system.js');

module.exports = new class Misdemeanors extends Command {
  constructor() {
    super({
      args: [
        new Argument({
          example: 'CP',
          type: 'law',
          name: 'law',
          key: 'law',
          preconditions: ['active_law']
        }),
        new Argument({
          example: 'Silver Bullet',
          type: 'user',
          name: 'user',
          key: 'user',
          defaultValue: ArgumentDefault.Author,
          preconditions: ['no_bot']
        })
      ],
      description: 'View the amount of misdemeanors a person has.',
      groupName: 'general',
      names: ['misdemeanors', 'mister_meaners', 'mr_meaners', 'mrmeaners']
    });
  }

  async run(msg, args) {
    const count = system.get_felon_count(msg.channel.guild.id, args.user.id, args.law);
    const felon = count >= config.repeat_felon_count || args.law.mandatory_felony;
    const self = msg.author.id === args.user.id;
    const user_tag = discord.tag(args.user).boldified;
    const start = self ? 'you are' : `${user_tag} is`;
    const append = felon ? `\n\n${start} subject to serving a prison sentence the next time \
${self ? 'you break' : `${user_tag} breaks`} the law ${args.law.name} (${args.law.id}).` : '';

    return discord.send_msg(
      msg,
      `${self ? 'Your' : `${user_tag}'s`} misdemeanor count is \
${count} for the law \`${args.law.name}\` (${args.law.id}).${append}`,
      `${discord.tag(args.user)}'s Misdemeanor Count`,
      null,
      null,
      false
    );
  }
}();
