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
const catch_discord = require('../utilities/catch_discord.js');
const client = require('../services/client.js');
const { CommandError, Context } = require('patron.js');
const {
  config: { prefix }, constants: { discord_err_codes, error_color }
} = require('../services/data.js');
const discord = require('../utilities/discord.js');
const handler = require('../services/handler.js');
const log = require('../utilities/logger.js');
const db = require('../services/database.js');
const chat = require('../services/chat.js');
const msg_collector = require('../services/message_collector.js');
const max_len = 2e3;

function handle_err(result) {
  switch (result.error.code) {
  case discord_err_codes.no_bots:
    return 'I don\'t have permission to do that.';
  case discord_err_codes.cant_dm:
    return 'I can\'t DM you. Please allow direct messages from server members.';
  default:
    if (discord_err_codes.missing_perms.includes(result.error.code)) {
      return 'I don\'t have permission to do that.';
    } else if (result.error.code >= discord_err_codes.internal[0]
      && result.error.code <= discord_err_codes.internal[1]) {
      return 'an unexpected error has occurred, please try again later.';
    } else if (result.error.message.startsWith(discord_err_codes.timeout)) {
      return 'Discord isn\'t responding, please try again later.';
    }

    log.error(result.error);

    return result.error.message;
  }
}

async function handle_result(msg, result) {
  let reply = `${discord.tag(msg.author).boldified}, `;

  switch (result.commandError) {
  case CommandError.Exception:
    reply += handle_err(result);
    break;
  case CommandError.BotPermission:
    if (result.permissions.includes('sendMessages') || result.permissions.includes('embedLinks')) {
      return;
    }

    reply += 'I don\'t have permission to do that.';
    break;
  case CommandError.MemberPermission:
    reply += 'you don\'t have permission to do that.';
    break;
  case CommandError.Cooldown:
    reply += 'you\'re using this command too fast.';
    break;
  case CommandError.InvalidContext:
    reply += `this command may only be used in \
${result.context === Context.Guild ? 'DMs' : 'a server'}.`;
    break;
  case CommandError.InvalidArgCount:
    reply += 'you\'re incorrectly using this command.\n';
    reply += `**Usage:** \`${prefix}${result.command.getUsage()}\`\n`;
    reply += `**Example:** \`${prefix}${result.command.getExample()}\``;
    break;
  case CommandError.Command:
  case CommandError.Precondition:
  case CommandError.TypeReader:
    reply += result.errorReason;
    break;
  default:
    if (result.error) {
      log.error(result.error);
      reply += result.error.message;
    } else {
      log.error(result);
      reply += 'an unknown error has occured.';
    }

    break;
  }
  await discord.create_msg(msg.channel, reply.slice(0, max_len), error_color);
}

client.on('messageCreate', catch_discord(async msg => {
  if (msg.author && !msg.author.bot) {
    await msg_collector.check(msg);
  }

  if (!msg.author || msg.author.bot) {
    return;
  }

  if (!msg.content.startsWith(prefix)) {
    if (msg.channel.guild) {
      await chat.add_cash(msg);
      await chat.add_court_messages(msg);

      return chat.add_giveaway_entry(msg);
    }
  }

  const result = await handler.run(msg, prefix.length);

  if (result.success || result.commandError === CommandError.UnknownCmd) {
    return;
  }

  await handle_result(msg, result);
}));
