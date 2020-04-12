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
const discord = require('../../utilities/discord.js');
const system = require('../../utilities/system.js');
const empty_argument = Symbol('Empty Argument');

module.exports = new class Case extends Command {
    constructor() {
        super({
            args: [
                new Argument({
                    example: 'Impeach Sperg!',
                    type: 'string',
                    name: 'text',
                    key: 'text',
                    remainder: true
                })
            ],
            description: 'Create a Congress bill.',
            groupName: 'general',
            names: ['bill']
        });
    }

    async run(msg, args) {
        const {congress_channel, congress_role} = db.fetch('guilds', { guild_id: msg.channel.guild.id });
        if (!msg.member.roles.includes(congress_role))
            return discord.send_msg(msg, "You must be in Congress to use this.");
        if (msg.channel.id !== congress_channel)
            return discord.send_msg(msg, "This must be used in the Congress channel.");
        await msg.delete();
        const m = await msg.channel.createMessage(`<@&${congress_role}> bill in <#${congress_channel}> by ${msg.author.mention}:\n${args.text}`);
        await m.addReaction("Yes:691047831414374411");
        await m.addReaction("No:691047880206843965");
    }
}();