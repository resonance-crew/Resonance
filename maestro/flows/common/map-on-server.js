// What the server holds of alice's thought map after thought-map.yaml's changes, read from outside the app: her
// sign-in at the Auth emulator, then GET /api/v1/me/thought-map with the ID token (the same document the app writes,
// over Firestore on the usual stack, through POST …/ops on `--stack writer-api`). A change the app shows but never
// sent fails here, whatever the app's caches would show after a relaunch.
//
//   - runScript:
//       file: common/map-on-server.js
//
// Reads AUTH_PORT, API_PORT and PASSWORD from the runner (`-e`).
var signIn = http.post(
  'http://localhost:' + AUTH_PORT + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator',
  {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@resonance.test', password: PASSWORD, returnSecureToken: true }),
  },
);
if (signIn.status !== 200) throw new Error('Auth emulator sign-in as alice: ' + signIn.status + ' ' + signIn.body);

var read = http.get('http://localhost:' + API_PORT + '/api/v1/me/thought-map', {
  headers: { Authorization: 'Bearer ' + json(signIn.body).idToken },
});
if (read.status !== 200) throw new Error('GET /api/v1/me/thought-map as alice: ' + read.status + ' ' + read.body);
var map = json(read.body);

function node(cardId) {
  for (var i = 0; i < map.nodes.length; i++) if (map.nodes[i].cardId === cardId) return map.nodes[i];
  return null;
}
function titles() {
  var all = [];
  for (var i = 0; i < map.groups.length; i++) all.push(map.groups[i].title);
  return all;
}
function check(ok, what) {
  if (!ok) throw new Error('The server’s map: ' + what + ' — ' + read.body);
}

check(node('alice-draft') !== null, '還沒寫完的清晨 (alice-draft) is not on it');
check(node('rich-story') === null, '搬家後的第一個安靜夜晚 (rich-story) is still on it');
check(node('rain-walk') !== null && node('letter') !== null, 'rain-walk or letter is missing');
check(node('rain-walk').y < node('letter').y, 'rain-walk was not moved above letter');
check(titles().indexOf('雨天的回憶 Maestro') >= 0, 'no region 雨天的回憶 Maestro');
check(titles().indexOf('晴天 Maestro') >= 0, 'no region 晴天 Maestro');
check(titles().indexOf('回憶') < 0, 'the region is still 回憶');
var edge = null;
for (var j = 0; j < map.edges.length; j++) if (map.edges[j].id === 'rain-walk_letter') edge = map.edges[j];
check(edge !== null && edge.label === '那年以後', 'the arrow rain-walk → letter does not say 那年以後');
