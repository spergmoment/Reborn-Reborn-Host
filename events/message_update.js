const client = require('../services/client.js');

client.on('messageUpdate', async (o, n) => client.emit("messageCreate", o));
