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
const { config } = require('../../services/data.js');
const db = require('../../services/database.js');
const client = require('../../services/client.js');
const number = require('../../utilities/number.js');
const reg = require('../../services/registry.js');
const discord = require('../../utilities/discord.js');
const system = require('../../utilities/system.js');
const lawyer_enum = require('../../enums/lawyer.js');
const min_amount = 0;
const to_cents = 100;
const time = number.msToTime(config.lawyer_accept_time).minutes;

module.exports = new class RequestLawyer extends Command {
  constructor() {
    super({
      preconditions: ['court_only', 'court_case', 'defendant_only'],
      args: [
        new Argument({
          example: '"Good guy"',
          key: 'member',
          name: 'member',
          type: 'member',
          preconditions: ['no_bot', 'no_self', 'not_muted']
        }),
        new Argument({
          example: '1000',
          key: 'amount',
          name: 'amount',
          type: 'cash',
          preconditions: ['min', 'cash'],
          preconditionOptions: [
            { minimum: min_amount },
            {
              allow_zero: true, held: true
            }
          ]
        })
      ],
      description: 'Sets the lawyer of a court case to the requested member.',
      groupName: 'courts',
      names: ['request_lawyer', 'set_lawyer']
    });
    this.running = {};
  }

  async run(msg, args) {
    const auto_cmd = reg.commands.find(x => x.names[0] === 'auto_lawyer');

    if (auto_cmd.running[msg.channel.id]) {
      return CommandResult.fromError('An auto request is already running for this case.');
    }

    const channel_case = db.get_channel_case(msg.channel.id);
    const res = await this.should_err(channel_case, msg.channel, args.member);

    if (res instanceof CommandResult) {
      return res;
    }

    this.running[msg.channel.id] = true;

    const {
      channel
    } = await system.get_channel(msg.channel, args.member, msg.author, args.amount, time);
    const check = await this.checks(channel_case, channel);

    if (check instanceof CommandResult) {
      return check;
    }

    const result = await this.verify(msg, args.member, channel, channel_case);

    if (result.conflicting) {
      await discord.create_msg(channel, `${msg.author.mention} has cancelled their \
lawyer request.`);

      return CommandResult.fromError('The previous interactive lawyer command was cancelled.');
    } else if (!result.success) {
      return CommandResult.fromError('The requested lawyer didn\'t reply.');
    }

    if (result.reply.content.toLowerCase() === 'yes') {
      return this.success(msg, channel, channel_case, args.member, args.amount);
    }

    await discord.create_msg(channel, `You have successfully declined \
${msg.author.mention}'s offer.`);

    return CommandResult.fromError('The requested lawyer declined your offer.');
  }

  async success(msg, channel, channel_case, member, amount) {
    const left = config.lawyer_change_count - (channel_case.lawyer_count + 1);

    db.update_lawyer_count(channel_case.id, channel_case.lawyer_count + 1);

    return system.accept_lawyer(
      msg.author,
      member,
      channel,
      channel_case,
      lawyer_enum.request,
      `${msg.author.mention}, You have successfully set your lawyer. \
You ${left === 0 ? 'cannot change your lawyer anymore' : `may change your lawyer up to \
${left} more time${left === 1 ? '' : 's'}`}.\n\n`,
      true,
      amount * to_cents
    );
  }

  async should_err(channel_case, channel, member) {
    const fired = db.get_fired_lawyers(channel_case.id).map(x => x.member_id);
    const excluded = this.excluded(channel_case, member, fired);

    if (excluded instanceof CommandResult) {
      return excluded;
    }

    const pre = await this.preexisting(channel_case, channel, member);

    if (pre instanceof CommandResult) {
      return pre;
    }
  }

  excluded(channel_case, member, exclude = []) {
    if (exclude.includes(member.id)) {
      return CommandResult.fromError(
        'This user cannot be your lawyer due to previously failing to do their job.'
      );
    }

    const warrant = db.get_warrant(channel_case.warrant_id);

    if (member.id === channel_case.judge_id) {
      return CommandResult.fromError('The presiding judge cannot be your lawyer.');
    } else if (member.id === channel_case.plaintiff_id) {
      return CommandResult.fromError('The prosecuting officer cannot be your lawyer.');
    } else if (member.id === warrant.judge_id) {
      return CommandResult.fromError('The approving judge cannot be your lawyer.');
    }
  }

  async preexisting(channel_case, channel, member) {
    if (channel_case.lawyer_id === member.id) {
      this.running[channel_case.channel_id] = false;

      return CommandResult.fromError('This user is already your lawyer.');
    } else if (channel_case.lawyer_id !== null) {
      const existing = await client.getRESTUser(channel_case.lawyer_id);
      const res = system.change_lawyer(channel_case, channel, existing, lawyer_enum.request);

      if (res instanceof CommandResult) {
        this.running[channel_case.channel_id] = false;

        return res;
      }

      db.insert('fired_case_lawyers', {
        member_id: channel_case.lawyer_id,
        guild_id: channel_case.guild_id,
        case_id: channel_case.id
      });

      if (channel_case.cost !== 0 && channel_case.request !== lawyer_enum.auto) {
        db.add_cash(channel_case.defendant_id, channel_case.guild_id, channel_case.cost, false);

        const def = await client.getRESTUser(channel_case.defendant_id);
        const amount = channel_case.cost / to_cents;

        return system.dm_cash(
          def,
          channel.guild,
          amount,
          'you have requested to change lawyers',
          'been given your',
          'back because'
        );
      }
    }
  }

  async checks(channel_case, channel) {
    if (!channel) {
      this.running[channel_case.channel_id] = false;

      return CommandResult.fromError('This user has their DMs disabled and there is no main \
channel in this server.');
    }
  }

  async verify(msg, member, channel, channel_case) {
    await discord.send_msg(msg, `${member.mention} has been informed of your request`);

    const res = discord.verify_channel_msg(
      msg,
      channel,
      null,
      null,
      new_msg => discord._verify_fn(new_msg, member),
      `lawyer-${channel_case.id}`,
      config.lawyer_accept_time
    ).then(x => x.promise);

    this.running[msg.channel.id] = false;

    return res;
  }
}();
