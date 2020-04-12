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
const { config } = require('../services/data.js');
const db = require('../services/database.js');
const Timer = require('../utilities/timer.js');
const notifications = require('../enums/notifications.js');
const branch = require('../enums/branch.js');
const discord = require('../utilities/discord.js');
const number = require('../utilities/number.js');
const system = require('../utilities/system.js');
const min_online = 0;
const min_nominations = 0;
const dm_interval = 144e5;
const impeached = 1728e5;
const hours_in_day = 24;

async function impeach(member, chief, min) {
  await discord.dm_fallback(member.user, `You have been impeached for failing to nominate \
${min} people, that aren't in-debt, to your branch within 48 hours since you were first notified.`);
  await system.impeach(
    member, member.guild, chief, 'impeached for having an inactive branch'
  );
  db.set_last_notified(member.id, member.guild.id, notifications.nominations, null);
}

function format_time(time) {
  const { days, hours, minutes } = number.msToTime(time);
  const total_hours = (days * hours_in_day) + hours;
  let format;

  if (total_hours) {
    format = ` within ${total_hours} hours`;
  } else if (minutes) {
    format = `within ${minutes} minutes`;
  } else {
    format = 'soon';
  }

  return format;
}

function upsert_notification(member_id, guild_id, time, exists) {
  if (exists) {
    db.set_last_dm(member_id, guild_id, notifications.nominations, time);
    db.set_last_notified(member_id, guild_id, notifications.nominations, time);
  } else {
    db.insert('notifications', {
      guild_id,
      member_id,
      type: notifications.nominations,
      last_dm: time,
      last_notified: time
    });
  }
}

async function dm(chief, guild, count) {
  const now = Date.now();
  const to_dm = guild.members.filter(x => x.roles.includes(chief));

  for (let i = 0; i < to_dm.length; i++) {
    const mem = to_dm[i];
    const notification = db.get_notification(mem.id, guild.id, notifications.nominations);

    if (count >= min_online && notification) {
      db.set_last_notified(mem.id, guild.id, notifications.nominations, null);
      db.set_last_active(mem.id, guild.id, notifications.nominations, now);
      continue;
    }

    const left = (notification || {}).last_notified - (notification || {}).last_modified_at;
    const past = notification && left > impeached;
    const nominated_recently = db
      .fetch_nominator_nominations(mem.id, guild.id)
      .filter(x => x.created_at > now - impeached && x.created_at < now);
    const copy = [...nominated_recently];
    const net = nominated_recently
      .filter(c => copy
        .filter(x => x.nominatee === c.nominatee && x.guild_id === c.guild_id).length === 1);

    if (past && net.length < min_nominations) {
      return impeach(mem, chief, min_nominations);
    }

    const time_left = now - (notification || { last_dm: 0 }).last_dm;
    const elapsed = time_left > dm_interval;

    if (!notification || elapsed) {
      const first = !notification
        || !notification.last_notified ? 'in 48 hours' : format_time(impeached - left);

      await discord.dm_fallback(mem.user, `Due to the lack of having at least ${min_online} \
members of your branch online consistently that aren't in-debt, you will have to nominate \
${min_nominations} or more people using the \`!nominate\` command or you will be impeached \
${first} and fined ${number.format(Math.abs(config.impeached))}.`, guild);
      upsert_notification(mem.id, guild.id, now, notification);
    }
  }
}

Timer(async () => {
  await discord.loop_guilds(async guild => {
    if (!guild) {
      return;
    }

    const res = db.fetch('guilds', { guild_id: guild.id });
    const chiefs = system.chief_roles.reduce((a, b) => {
      const key = res[b];
      const value = res[branch[b]];

      a[key] = value;

      return a;
    }, {});
    const chief_keys = Object.keys(chiefs).filter(x => x);

    for (let j = 0; j < chief_keys.length; j++) {
      const role = chiefs[chief_keys[j]];

      if (!role) {
        continue;
      }

      const count = system.get_branch_members(guild, chief_keys[j], role).length;

      await dm(chief_keys[j], guild, count);
    }
  });
}, config.auto_dm_nominations);
