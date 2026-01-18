// This file tells Vercel to treat this as a serverless function
const app = require('../dist/server-vercel.js');

module.exports = app.default || app;