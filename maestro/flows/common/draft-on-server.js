// What the server holds of a draft of alice's, read from outside the app: her sign-in at the Auth emulator, then her
// 私人卡 (GET /api/v1/me/cards?tab=draft) for the card titled ${TITLE}, and that card (GET /api/v1/cards/{id}): its
// story must hold ${WORDS}. A draft the app shows but never sent fails here, whatever its own caches show.
//
//   - runScript:
//       file: common/draft-on-server.js
//       env:
//         TITLE: 斷線前的晚上 Maestro
//         WORDS: 燈一盞一盞熄了 Maestro
//         TRIES: '1'
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
var auth = { headers: { Authorization: 'Bearer ' + json(signIn.body).idToken } };

// TRIES (default 1): asked again at once until the words are there, at most that many times — for waiting on a save
// still on its way (the writer's bar says 已儲存 for the card's creation already, before its story is sent).
var tries = typeof TRIES === 'undefined' ? 1 : Number(TRIES);
var last = '';
for (var attempt = 1; attempt <= tries; attempt++) {
  var shelf = http.get('http://localhost:' + API_PORT + '/api/v1/me/cards?tab=draft', auth);
  if (shelf.status !== 200) throw new Error('GET /api/v1/me/cards?tab=draft as alice: ' + shelf.status + ' ' + shelf.body);
  var cards = json(shelf.body).cards;
  var id = null;
  for (var i = 0; i < cards.length; i++) if (cards[i].title === TITLE) id = cards[i].id;
  if (id === null) {
    last = 'No 私人卡 titled ' + TITLE + ' on the server: ' + shelf.body;
    continue;
  }
  var card = http.get('http://localhost:' + API_PORT + '/api/v1/cards/' + id, auth);
  if (card.status !== 200) throw new Error('GET /api/v1/cards/' + id + ' as alice: ' + card.status + ' ' + card.body);
  var story = json(card.body).story || '';
  if (story.indexOf(WORDS) >= 0) {
    last = '';
    break;
  }
  last = 'The server’s ' + TITLE + ' (' + id + ') does not hold ' + WORDS + ': ' + JSON.stringify(story);
}
if (last) throw new Error(last + (tries > 1 ? ' (asked ' + tries + ' times)' : ''));
