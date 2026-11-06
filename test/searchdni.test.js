global.CONFIG = { get: () => ({ bucketName: 'x', approvePercentage: 90, rangoES: 1 }) };
const Module = require('module');
const orig = Module._load;
Module._load = function (req, parent, isMain) {
  if (/liveness|mail|tokenizer|\.\/shared|\/login$|aws-sdk/.test(req)) return new Proxy({ Rekognition: function(){ return {}; } }, { get: (t, k) => t[k] || (() => {}) });
  return orig.apply(this, arguments);
};
const m = require('../services/vida/v2/services/login.js');
console.log(Object.keys(m));
const calls = [];
global.VIDA_DB = { sync_query: async (q, p) => { calls.push({ q, p }); return []; } };
const run = async (body) => { calls.length = 0; const out = {}; const res = { status: () => ({ json: (j) => { out.j = j; } }) }; await m.searchdni({ body }, res, () => {}); return { out, calls: calls.slice() }; };
(async () => {
  let r = await run({ cuil: '20-12345678-6' });
  console.log('cuil ok ->', r.calls[0].p, /u\.cuil = \?/.test(r.calls[0].q), !/u\.dni = \?/.test(r.calls[0].q));
  r = await run({ cuil: '20123456787' });
  console.log('cuil malo ->', r.out.j.message, r.calls.length);
  r = await run({ dni: '12.345.678', sexo: 'M' });
  console.log('dni+sexo ->', r.calls[0].p, /u\.dni = \? and u\.sexo = \?/.test(r.calls[0].q));
  r = await run({});
  console.log('vacio ->', r.out.j.message);
})();
