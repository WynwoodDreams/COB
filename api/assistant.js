'use strict';
// /api/assistant: the board's opportunity assistant. All of the work is in lib/assistant;
// this file only exists so Vercel deploys it as a function. Credentials stay in the
// server's environment (AI_GATEWAY_API_KEY); nothing in the page knows them.
const { createHandler } = require('../lib/assistant/handler');
module.exports = createHandler();
