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

const { MultiMutex, CommandResult } = require('patron.js');
const { Member } = require('eris');
const { config } = require('../services/data.js');
const client = require('../services/client.js');
const discord = require('./discord.js');
const db = require('../services/database.js');
const verdict = require('../enums/verdict.js');
const branch = require('../enums/branch.js');
const lawyer_enum = require('../enums/lawyer.js');
const lawyer_state = require('../enums/lawyer_state.js');
const number = require('./number.js');
const str = require('../utilities/string.js');
const catch_discord = require('../utilities/catch_discord.js');
const util = require('../utilities/util.js');
const remove_role = catch_discord(client.removeGuildMemberRole.bind(client));
const accept_message = '{0} is offering you {1} to be their lawyer in case #{2}.\n\nReply with \
`yes` within {3} to accept or `no` to decline to this offer.';
const statuses = ['online', 'dnd', 'idle', 'offline'];
const max = 10;
const double = 2;
const to_cents = 100;
const _time = number.msToTime(config.auto_lawyer_accept_time).minutes;

module.exports = {
  chief_roles: ['chief_justice_role', 'chief_officer_role', 'house_speaker_role'],
  jailed_roles: ['imprisoned_role', 'jailed_role', 'trial_role'],
  gov_roles: ['officer_role', 'judge_role', 'congress_role'],
  day_hours: 24,
  max_evidence: 16e2,
  max_warrants: 25,
  bitfield: 2048,
  fetch_limit: 100,
  mutex: new MultiMutex(),

  _existing_pub_channel(guild_id, channel) {
    const channels = db.fetch_channels(guild_id);
    const existing = channels.find(x => x.channel_id === channel.id && x.active === 1);

    return {
      channels,
      existing: existing || false
    };
  },

  _public_channel(msg, channel, type) {
    return discord.create_msg(
      msg.channel, `${discord.tag(msg.author).boldified}, ${channel.mention} has \
been ${type} as a public channel.`
    );
  },

  _court_channel(msg, member, type) {
    return discord.create_msg(
      msg.channel,
      `${discord.tag(msg.author).boldified}, ${member.mention} has been ${type} the court.`
    );
  },

  get_court_channel(guild) {
    const { court_category } = db.fetch('guilds', { guild_id: guild.id });
    const channel = guild.channels.get(court_category);

    if (!court_category || !channel) {
      return {
        court_category,
        success: false,
        reason: 'The Court category channel needs to be set.'
      };
    }

    return {
      court_category,
      success: true
    };
  },

  set_db_property(msg, key, value, str_key, str_value) {
    db.update_guild_properties(msg.channel.guild.id, { [key]: value });

    return discord.create_msg(
      msg.channel, `${discord.tag(msg.author).boldified}, I have set the ${str_key} to \
${str_value}.`
    );
  },

  async loop_guild_verdicts(fn) {
    return discord.loop_guilds(async (guild, id) => {
      const verdicts = db.fetch_verdicts(id);

      for (let i = 0; i < verdicts.length; i++) {
        await fn(guild, id, verdicts[i]);
      }
    });
  },

  async loop_guilds(fn) {
    return discord.loop_guilds(async (guild, id) => {
      const guildfetch = db.fetch('guilds', { guild_id: guild.id });

      await fn(guild, id, guildfetch);
    });
  },

  async loop_guild_warrants(fn) {
    return discord.loop_guilds(async (guild, id) => {
      const warrants = db.fetch_warrants(id);

      for (let i = 0; i < warrants.length; i++) {
        await fn(guild, id, warrants[i]);
      }
    });
  },

  insert_automated_verdict(guild_id, c_case, case_verdict, opinion) {
    return db.insert('verdicts', {
      guild_id,
      case_id: c_case.id,
      defendant_id: c_case.defendant_id,
      verdict: case_verdict,
      opinion
    });
  },

  law_in_effect(law, time) {
    return Date.now() - (law.created_at + time) > 0;
  },

  async lawyer_picked(channel_id, guild, lawyer) {
    const channel_case = db.get_channel_case(channel_id);
    const channel = guild.channels.get(channel_id);

    if (!channel) {
      return;
    }

    if (guild.members.has(channel_case.plaintiff_id)) {
      await channel.editPermission(
        channel_case.plaintiff_id,
        this.bitfield,
        0,
        'member',
        `Lawyer was picked (${channel_case.lawyer_id})`
      );
    }

    return channel.editPermission(
      lawyer.id,
      this.bitfield,
      0,
      'member',
      `Lawyer of case #${channel_case.id}`
    );
  },

  async dm_lawyer(guild, lawyer, defendant, channel, c_case, amount) {
    const member = guild.members.get(lawyer.member_id)
      || await client.getRESTUser(lawyer.member_id);

    await discord.dm(
      member.user ? member.user : member,
      `You are now the lawyer of ${defendant.mention} in case #${c_case.id}.`,
      guild
    );
    await this.accept_lawyer(
      defendant, member, channel, c_case, lawyer_enum.auto, '', false, amount
    );
  },

  large_sum_of_money(guild, percent) {
    const top = db
      .get_guild_members(guild.id)
      .sort((a, b) => b.cash - a.cash)
      .slice(0, max);

    return top.reduce((a, b) => a + b.cash, 0) / top.length * percent;
  },

  _update_lawyer(c_case, amount, lawyer, type) {
    db.set_lawyer(lawyer.id, c_case.id, type);
    db.set_case_cost(c_case.id, amount);

    const found = db.get_lawyer(c_case.guild_id, lawyer.id, false);

    if (!found) {
      db.set_active_lawyer(c_case.guild_id, lawyer.id);
    }
  },

  async _paid_money(c_case, lawyer, guild, defendant, amount, type) {
    const user_def = defendant.user ? defendant.user : defendant;
    const bonus = number.format(amount * config.lawyer_innocence_bonus, true);
    const cop = await client.getRESTUser(c_case.plaintiff_id);
    const warrant = db.get_warrant(c_case.warrant_id);
    const judge = await client.getRESTUser(warrant.judge_id);
    const payment = `\n\nThe officer (${cop.mention}) and the approving judge \
(${judge.mention}) will cover the legal fees if {0} not convicted of the crime`;

    await discord.dm(
      lawyer.user ? lawyer.user : lawyer,
      `You will receive a ${bonus} bonus for your legal services for ${discord.tag(user_def)} \
if a not guilty verdict is reached in case #${c_case.id}. \
${str.format(payment, `your client, ${discord.tag(user_def).boldified}, is`)}.`,
      guild
    );
    await this.lawyer_picked(c_case.channel_id, guild, lawyer);

    if (type !== lawyer_enum.auto) {
      db.add_cash(defendant.id, c_case.guild_id, -amount, false);
    }

    await this.dm_cash(
      user_def, guild,
      amount / to_cents,
      `of potential legal fees for covering your lawyer in case #${c_case.id}. \
${str.format(payment, 'you are not')}`,
      `been ${type === lawyer_enum.auto ? 'covered' : 'charged'}`,
      type === lawyer_enum.auto ? 'by the government, ' : 'because'
    );
  },

  async accept_lawyer(defendant, lawyer, channel, c_case, type, cnt, accept = true, amount = 0) {
    this._update_lawyer(c_case, amount, lawyer, type);

    if (accept) {
      await discord.create_msg(channel, `You have successfully accepted \
${defendant.mention}'s offer.`);
    }

    const guild = client.guilds.get(c_case.guild_id);

    if (amount || amount === 0) {
      await this._paid_money(c_case, lawyer, guild, defendant, amount, type);
    }

    const judge = guild.members.get(c_case.judge_id) || await client.getRESTUser(c_case.channel_id);
    const cop = guild.members.get(c_case.plaintiff_id)
      || await client.getRESTUser(c_case.plaintiff_id);
    const format = number.format(amount, true);
    const def = cnt ? discord.tag(defendant.user || defendant).boldified : defendant.mention;

    return client.createMessage(
      c_case.channel_id, `${cnt ? cnt : ''}${judge.mention} ${cop.mention}\n${lawyer.mention} has \
accepted ${def}'s lawyer request${amount || amount === 0 ? ` at the cost of ${format}` : ''}.\n
${discord.tag(lawyer.user || lawyer).boldified}, you have ${config.auto_pick_lawyer} hours to give \
a plea using \`${config.prefix}plea <plea>\` or you will be automatically replaced with another \
lawyer.`
    );
  },

  change_lawyer(c_case, channel, old_lawyer, type) {
    if (c_case.lawyer_count >= config.lawyer_change_count) {
      const user = c_case.defendant_id === old_lawyer.id ? 'yourself' : discord
        .tag(old_lawyer).boldified;

      return CommandResult.fromError(`You already have ${user} as your lawyer \
and you cannot change it anymore.`);
    } else if (c_case.def_left === 1) {
      return CommandResult.fromError('You cannot change lawyers due to leaving mid-trial.');
    }

    db.set_case_plea(c_case.id, null);
    db.set_lawyer(null, c_case.id, type);

    if (c_case.defendant_id !== old_lawyer.id && channel.guild.members.has(old_lawyer.id)) {
      return channel.editPermission(
        old_lawyer.id, 0, this.bitfield, 'member', 'Requested a lawyer change'
      );
    }
  },

  get_excluded(channel_case) {
    const exclude = [channel_case.judge_id, channel_case.plaintiff_id, channel_case.defendant_id];
    const warrant = db.get_warrant(channel_case.warrant_id);

    return exclude.concat(warrant.judge_id);
  },

  async _valid_lawyer(lawyers, guild, channel_case, excluded, key, multiplier, time) {
    let picked = null;

    for (let i = 0; i < lawyers.length; i++) {
      const lawyer = lawyers[i];

      if (excluded.includes(lawyer.member_id)) {
        continue;
      }

      const max_amount = this.large_sum_of_money(guild, config.max_money_percent);

      if (lawyer.rate > max_amount) {
        continue;
      }

      const member = guild.members.get(lawyer.member_id);
      const muted = member && this._prisoned_lawyer(guild, member);

      if (!member || muted) {
        continue;
      }

      const channel = guild.channels.get(channel_case.channel_id);
      const author = await client.getRESTUser(channel_case.defendant_id);
      const res = await this._verify({
        author, channel: { guild }, content: `!auto_lawyer${key}`
      }, channel, member, lawyer.rate * multiplier, time);

      if (!res) {
        continue;
      }

      picked = lawyer;
      break;
    }

    return picked;
  },

  async auto_pick_lawyer(guild, c_case, key = '_auto', time = _time, multiplier = 1, counter = 0) {
    const lawyers = util.shuffle(db.get_guild_lawyers(guild.id));
    const excluded = db.get_fired_lawyers(c_case.id)
      .map(x => x.member_id).concat(this.get_excluded(c_case));
    const filtered = lawyers.filter(x => {
      const mem = guild.members.get(x.member_id);

      return mem && !mem.bot && mem.status === statuses[counter % statuses.length];
    });

    db.set_lawyer_state(lawyer_state.started, c_case.id);

    const picked = await this._valid_lawyer(
      filtered, guild, c_case, excluded, key, multiplier, time
    );

    if (!picked) {
      const multi = (counter + 1) % statuses.length === 0
        && counter !== 0 ? multiplier * double : multiplier;

      return this.auto_pick_lawyer(guild, c_case, key, time, multi, counter + 1);
    }

    db.set_lawyer_state(lawyer_state.finished, c_case.id);

    return {
      lawyer: picked, amount: picked.rate * multiplier
    };
  },

  async _verify(msg, channel, member, amount, time) {
    const {
      channel: found_channel, channel_case
    } = await this.get_channel(channel, member, msg.author, amount / to_cents, time);

    if (!found_channel) {
      return false;
    }

    const result = await discord.verify_channel_msg(
      msg,
      found_channel,
      null,
      null,
      x => x.author.id === member.id
        && (x.content.toLowerCase() === 'yes' || x.content.toLowerCase() === 'no'),
      `auto_lawyer-${channel_case.id}`
    ).then(x => x.promise);

    if (!result.success || result.reply.content.toLowerCase() === 'no') {
      return false;
    }

    return true;
  },

  async get_channel(channel, member, author, amount, time) {
    const channel_case = db.get_channel_case(channel.id);
    let found_channel = await member.user.getDMChannel();
    const dm_result = await discord.dm(member.user, str.format(
      accept_message,
      discord.tag(author).boldified,
      number.format(amount),
      channel_case.id,
      `${time} minute${time === 1 ? '' : 's'}`
    ), channel.guild);

    if (!dm_result) {
      found_channel = discord.get_main_channel(channel.guild.id);
    }

    return {
      channel: found_channel,
      channel_case
    };
  },

  get_top_lawyers(guild) {
    return db
      .get_guild_lawyers(guild.id)
      .filter(x => x.active === 1)
      .sort((a, b) => {
        const a_record = this.get_win_percent(a.member_id, guild);
        const b_record = this.get_win_percent(b.member_id, guild);

        if (a_record.wins === b_record.wins) {
          return a_record.losses - b_record.losses;
        }

        return b_record.wins - a_record.wins;
      });
  },

  dm_cash(user, guild, amount, reason, action, sep = 'for') {
    let outcome;

    if (action) {
      outcome = action;
    } else if (amount < 0) {
      outcome = 'lost';
    } else {
      outcome = 'been rewarded with';
    }

    const value = amount < 0 ? Math.abs(amount) : amount;
    const format = number.format(value);
    const current_balance = db.get_cash(user.id, guild.id);

    return discord.dm(
      user,
      `You have ${outcome} ${format} ${sep} ${reason}.\n
Your current balance is ${number.format(current_balance)}.`,
      guild
    );
  },

  member_in_debt(member, guild) {
    const cash = db.get_cash(member.id, guild.id);

    return cash < config.in_debt;
  },

  async impeach(member, guild, role, reason) {
    const time = Date.now();

    if (guild.members.has(member.id) && guild.roles.has(role)) {
      await remove_role(guild.id, member.id, role, reason);
    }

    db.add_cash(member.id, guild.id, config.impeached);
    db.update_impeachment(guild.id, member.id, time);

    const user = member instanceof Member ? member.user : member;

    await this.dm_cash(user, guild, config.impeached, `getting ${reason}`);

    const [recent_nomination] = db
      .fetch_nominations(guild.id)
      .filter(x => x.nominatee === member.id)
      .sort((a, b) => b.created_at - a.created_at);

    if (recent_nomination) {
      const nominator = await client.getRESTUser(recent_nomination.nominator);

      db.add_cash(recent_nomination.nominator, guild.id, config.chief_impeached_deduction);
      await this.dm_cash(nominator, guild, config.impeached, `nominating ${member.mention} \
who recently got impeached`);
    }

    return this.reward_congress(guild, member);
  },

  async reward_congress(guild, impeached) {
    const { house_speaker_role, congress_role } = db.fetch('guilds', { guild_id: guild.id });
    const members = guild.members
      .filter(x => x.roles.includes(house_speaker_role) || x.roles.includes(congress_role));

    for (let i = 0; i < members.length; i++) {
      db.add_cash(members[i].id, guild.id, config.congress_impeachment_check);
      await this.dm_cash(
        members[i].user,
        guild,
        config.congress_impeachment_check,
        `${impeached.mention} was impeached`,
        null,
        'as a member of Congress because'
      );
    }
  },

  get_branch_members(guild, role, chief) {
    return guild.members.filter(
      x => (x.roles.includes(role)
        || x.roles.includes(chief))
        && discord.is_online(x)
        && !this.member_in_debt(x, guild)
    );
  },

  chief_role(member) {
    const res = db.fetch('guilds', { guild_id: member.guild.id });

    return Object.keys(res).find(
      x => this.chief_roles.includes(x) && member.roles.includes(res[x])
    ) || null;
  },

  branch_role_from_chief(member) {
    const chief_role = this.chief_role(member);

    return branch[chief_role] || null;
  },

  async update_guild_case(id, guild) {
    const new_case = db.get_case(id);
    const { case_channel } = db.fetch('guilds', { guild_id: guild.id });
    const c_channel = guild.channels.get(case_channel);

    if (c_channel) {
      return this.edit_case(c_channel, new_case);
    }

    return null;
  },

  _prisoned_lawyer(guild, member) {
    const query = db.fetch('guilds', { guild_id: guild.id });
    const included = this.jailed_roles.slice(0, -1);
    const roles = included.map(x => query[x]);

    return member.roles.some(x => roles.includes(x));
  },

  async get_lawyer_payment(c_case, guilty) {
    if (c_case.lawwyer_id === c_case.defendant_id || c_case.lawyer_id === null) {
      return '';
    }

    let amount = c_case.cost;
    const lawyer = await client.getRESTUser(c_case.lawyer_id);
    const defendant = await client.getRESTUser(c_case.defendant_id);
    const append = `for being the lawyer of case #${c_case.id}.`;

    if (guilty) {
      return `\n\n${lawyer.mention}, has been rewarded with \
${number.format(amount, true)} from the defendant, ${defendant.mention}, ${append}`;
    }

    amount = amount * (1 + config.lawyer_innocence_bonus) / double;

    const split = number.format(amount, true);
    const warrant = db.get_warrant(c_case.warrant_id);
    const officer = await client.getRESTUser(c_case.plaintiff_id);
    const judge = await client.getRESTUser(warrant.judge_id);
    const detainment = warrant.request === 1;
    const arrest = detainment ? 'detaining' : 'arresting';
    const grant = detainment ? 'approving' : 'granting';

    return `\n\n${lawyer.mention}, has been rewarded with ${split} each from the ${grant} judge \
(${judge.mention}) and the ${arrest} officer (${officer.mention}) ${append}`;
  },

  async get_active_cases(guild_id, defendant_id, fn) {
    const cases = db.fetch_cases(guild_id);
    const active = [];

    for (let i = 0; i < cases.length; i++) {
      if (cases[i].defendant_id !== defendant_id) {
        continue;
      }

      const case_verdict = db.get_verdict(cases[i].id);
      const no_verdict = !case_verdict;
      const fn_passed = !fn || await fn(cases[i]);

      if (no_verdict && fn_passed) {
        active.push(cases[i]);
      }
    }

    return active;
  },

  async has_active_case(guild_id, defendant_id) {
    const cases = await this.get_active_cases(guild_id, defendant_id);

    return {
      c_case: cases[0] || null,
      active: cases.length !== 0
    };
  },

  async free_from_court(guild_id, defendant_id, roles) {
    const { active } = await this.has_active_case(guild_id, defendant_id);
    const free = !active;

    if (free) {
      for (let i = 0; i < roles.length; i++) {
        await remove_role(guild_id, defendant_id, roles[i], 'Court case is over');
      }
    }

    return free;
  },

  case_finished(case_id) {
    const currrent_verdict = db.get_verdict(case_id);
    const finished = currrent_verdict && currrent_verdict.verdict !== verdict.pending;

    if (finished) {
      let reason = '';

      if (currrent_verdict.verdict === verdict.mistrial) {
        reason = 'This case has already been declared as a mistrial.';
      } else if (currrent_verdict.verdict === verdict.inactive) {
        reason = 'This case has already been declared inactive.';
      } else {
        reason = 'This case has already reached a verdict.';
      }

      return {
        finished: true,
        reason
      };
    }

    return {
      finished: false
    };
  },

  async close_case(to_pin, channel) {
    await to_pin.pin();
    await Promise.all(channel.permissionOverwrites.map(
      x => channel.editPermission(x.id, 0, this.bitfield, x.type, 'Case is over')
    ));
  },

  get_felon_count(guild_id, defendant_id, law) {
    const verdicts = db
      .fetch_member_verdicts(guild_id, defendant_id)
      .filter(x => x.verdict === verdict.guilty);
    let count = 0;

    for (let i = 0; i < verdicts.length; i++) {
      const user_case = db.get_case(verdicts[i].case_id);
      const { id } = db.get_law(user_case.law_id);

      if (id === law.id) {
        count++;
      }
    }

    return count;
  },

  mute_felon(guild_id, defendant_id, law) {
    const felon_count = this.get_felon_count(guild_id, defendant_id, law);

    return felon_count >= config.repeat_felon_count;
  },

  get_win_percent(lawyer_id, guild) {
    const wins = this.get_case_count(lawyer_id, guild, x => x.verdict === verdict.innocent);
    const losses = this.get_case_count(lawyer_id, guild, x => x.verdict === verdict.guilty);
    const total = wins + losses;

    return {
      wins,
      losses,
      win_percent: total === 0 ? 0 : wins / total
    };
  },

  get_case_count(lawyer_id, guild, fn) {
    const cases = db.fetch_cases(guild.id);
    let count = 0;

    for (let i = 0; i < cases.length; i++) {
      const c_case = cases[i];

      if (c_case.lawyer_id !== lawyer_id || c_case.defendant_id === lawyer_id) {
        continue;
      }

      const case_verdict = db.get_verdict(c_case.id);

      if (!case_verdict) {
        continue;
      }

      const res = fn(case_verdict);

      if (res) {
        count++;
      }
    }

    return count;
  },

  async find(items, fn, extra) {
    let res;

    for (let i = 0; i < items.length; i++) {
      const found = await fn(items[i], extra, i);

      if (found) {
        res = found;
        break;
      }
    }

    return res;
  },

  parse_id(msg) {
    const [embed] = msg.embeds;

    if (!embed || !embed.description) {
      return null;
    }

    const split = embed.description.split('**ID:** ');
    const parsed_id = split[1] ? split[1].split('\n') : null;

    return parsed_id && !isNaN(parsed_id[0]) ? Number(parsed_id[0]) : null;
  },

  async should_prune(channel, arr, fn) {
    const messages = await discord.fetch_msgs(channel);

    if (messages.length !== arr.length || messages.some(x => x && !x.embeds.length)) {
      return true;
    }

    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      const was_sent = await this.find(messages, fn, item);

      if (!was_sent) {
        return true;
      }
    }

    return false;
  },

  async prune(channel, reason = '') {
    const messages = await discord.fetch_msgs(channel);

    await discord.delete_msgs(channel, messages, reason);
  },

  format_laws(laws) {
    const msgs = [];

    for (let i = 0; i < laws.length; i++) {
      const { name, content, min_verdict, max_verdict,
        mandatory_felony, created_at, id, edited_at } = laws[i];
      const { embed } = discord.embed({});
      let description = `${content}${mandatory_felony ? ' (felony)' : ''}`;

      if (min_verdict !== null) {
        description += `\n**Minimum:** ${util.get_time(min_verdict)}`;
      }

      if (max_verdict !== null) {
        description += `\n**Maximum:** ${util.get_time(max_verdict)}`;
      }

      if (edited_at !== null) {
        const expires = number.msToTime(edited_at + config.law_in_effect - Date.now());
        let time = '';

        if (expires.hours > 0) {
          time = `in ${expires.hours} hours`;
        } else {
          time = 'soon';
        }

        description += ` (OUTDATED: expires ${time})`;
      }

      const active = this.law_in_effect(laws[i], config.law_in_effect);

      embed.timestamp = new Date(created_at + config.law_in_effect).toISOString();
      embed.footer = {
        text: active ? 'In effect since' : 'Takes effect'
      };
      embed.description = `**ID:** ${id}\n**Name:** ${name}\n**Description:** ${description}`;
      msgs.push(embed);
    }

    return msgs;
  },

  add_law(channel, law) {
    return this.mutex.sync(`${channel.guild.id}-laws`, async () => channel
      .createMessage({ embed: this.format_laws([law])[0] }));
  },

  async update_laws(channel, laws) {
    return this.mutex.sync(`${channel.guild.id}-laws`, async () => {
      const fn = (x, item) => this.format_laws([item])[0].description === x.embeds[0].description;
      const to_prune = await this.should_prune(channel, laws, fn);

      if (to_prune) {
        await this.prune(channel, 'Clearing old laws for new laws');

        const msgs = this.format_laws(laws);

        for (let i = 0; i < msgs.length; i++) {
          await channel.createMessage({ embed: msgs[i] });
        }
      }

      return laws;
    });
  },

  format_warrant_time(time_left) {
    const { days, hours, minutes } = number.msToTime(time_left);
    let format = '';

    if (time_left < 0) {
      format = 'Expired';
    } else if (days || hours || minutes) {
      const total_time = this.day_hours * days;
      const time = total_time + hours ? `${total_time + hours} hours` : `${minutes} minutes`;

      format = `Expires in ${time}`;
    } else {
      format = 'Expiring soon';
    }

    return format;
  },

  async format_warrant(guild, warrant, id, served, type = 'Warrant') {
    const { defendant_id, judge_id, evidence, approved, created_at, law_id } = warrant;
    const law = db.get_law(law_id);
    const defendant = client.users.get(defendant_id) || await client.getRESTUser(defendant_id);
    let judge;

    if (approved) {
      judge = guild.members.get(judge_id) || await client.getRESTUser(judge_id);
    }

    const format = this.format_warrant_time(created_at + config.auto_close_warrant - Date.now());
    let c_case = '';

    if (type === 'Warrant') {
      const found = db.fetch_cases(guild.id).find(x => x.warrant_id === warrant.id);

      if (found) {
        c_case = `\n**Case ID**: ${found.id}`;
      }
    }

    return {
      title: `${type} for ${discord.tag(defendant)} (${law.name})`,
      description: `**ID:** ${id}${judge ? `\n**Granted by:** ${judge.mention}` : ''}
**Evidence:**${evidence ? `\n${evidence.trim().slice(0, this.max_evidence)}` : 'N/A'}
**Status:** ${served ? 'Served' : format}${c_case}`
    };
  },

  _sync_send_channels(channel, key, fn) {
    return this.mutex.sync(`${channel.guild.id}-${key}`, () => fn());
  },

  async _parse_sendable_msg(channel, arr) {
    const msgs = await discord.fetch_msgs(channel, this.fetch_limit);
    const [most_recent] = msgs;
    const id = this.parse_id(most_recent || { embeds: [] });
    const index = arr.findIndex(x => x.id === id);

    return {
      msgs, index
    };
  },

  async edit_warrant(channel, warrant) {
    return this._sync_send_channels(channel, 'warrants', async () => {
      const msgs = await discord.fetch_msgs(channel);
      const { id, executed } = warrant;
      const found = msgs.find(x => this.parse_id(x) === id);

      if (found) {
        const obj = discord.embed(await this.format_warrant(channel.guild, warrant, id, executed));

        return found.edit(obj);
      }

      return warrant;
    });
  },

  async add_warrant(channel, warrant) {
    return this.mutex.sync(`${channel.guild.id}-warrants`, async () => {
      const { id, executed } = warrant;
      const obj = discord.embed(await this.format_warrant(channel.guild, warrant, id, executed));

      return channel.createMessage(obj);
    });
  },

  async update_warrants(channel, warrants) {
    return this._sync_send_channels(channel, 'warrants', async () => {
      const { msgs, index } = await this._parse_sendable_msg(channel, warrants);

      return this.send_objects(msgs, index, warrants, channel, x => this.format_warrant(
        channel.guild, x, x.id, x.executed
      ));
    });
  },

  async format_case(guild, c_case) {
    const judge = guild.members.get(c_case.judge_id) || await client.getRESTUser(c_case.judge_id);
    const case_verdict = db.get_verdict(c_case.id);
    let verdict_string;
    let append = `\n**Presiding judge:** ${judge.mention}`;

    if (case_verdict) {
      verdict_string = Object.keys(verdict).find(x => verdict[x] === case_verdict.verdict);
      verdict_string = verdict_string.split('_').map(str.to_uppercase).join(' ');
      append += `\n**Verdict:** ${verdict_string}`;

      if (case_verdict.verdict !== verdict.mistrial) {
        append += `\n**Opinion:** ${case_verdict.opinion}`;
      }
    }

    const warrant = db.get_warrant(c_case.warrant_id);
    const format = await this.format_warrant(guild, warrant, c_case.id, case_verdict, 'Case');

    format.description += append;

    return format;
  },

  async edit_case(channel, c_case) {
    return this._sync_send_channels(channel, 'cases', async () => {
      const msgs = await discord.fetch_msgs(channel);
      const found = msgs.find(x => this.parse_id(x) === c_case.id);

      if (found) {
        const obj = discord.embed(await this.format_case(channel.guild, c_case));

        return found.edit(obj);
      }

      return c_case;
    });
  },

  async add_case(channel, c_case) {
    return this.mutex.sync(`${channel.guild.id}-cases`, async () => {
      const obj = discord.embed(await this.format_case(channel.guild, c_case));

      return channel.createMessage(obj);
    });
  },

  async update_cases(channel, cases) {
    return this._sync_send_channels(channel, 'cases', async () => {
      const { msgs, index } = await this._parse_sendable_msg(channel, cases);

      return this.send_objects(
        msgs, index, cases, channel, x => this.format_case(channel.guild, x)
      );
    });
  },

  async send_objects(msgs, index, arr, channel, object_fn) {
    if (index === -1 && msgs.length !== 0) {
      return;
    }

    const to_slice = msgs.length === 0 ? 0 : index + 1;
    const sliced = arr.slice(to_slice);

    for (let i = 0; i < sliced.length; i++) {
      const obj = discord.embed(await object_fn(sliced[i]));

      await channel.createMessage(obj);
    }

    return sliced;
  }
};
