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
const system = require('../../utilities/system.js');

module.exports = new class SetLawChannel extends Command {
  constructor() {
    super({
      args: [
        new Argument({
          example: 'Laws',
          key: 'channel',
          name: 'channel',
          type: 'textchannel',
          remainder: true
        })
      ],
      description: 'Sets the law channel.',
      groupName: 'owners',
      names: ['set_law_channel', 'set_laws_channel']
    });
  }

  async run(msg, args) {
    await system.set_db_property(
      msg, 'law_channel', args.channel.id, 'Law channel', args.channel.mention
    );

    const laws = db.fetch_laws(msg.channel.guild.id).filter(x => x.active === 1);

    await system.update_laws(args.channel, laws);
  }
}();
